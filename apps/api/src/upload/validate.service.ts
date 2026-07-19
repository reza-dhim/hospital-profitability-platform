import { Injectable, Logger } from "@nestjs/common";
import { UploadType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantSessionSql } from "../prisma/tenant-session.sql";
import { ValidationIssue, parseNumeric } from "./validation-issue";
import { MasterDataLookup, NATURAL_KEY_FIELDS, OUTLIER_FIELD, ROW_RULES } from "./row-validation-rules";
import { mean, stddev } from "./stats.util";

export interface UploadValidateJobData {
  uploadBatchId: string;
  hospitalId: string;
  organizationId: string;
  uploadedByUserId: string;
}

const OUTLIER_TRAILING_PERIODS = 6;
const OUTLIER_MIN_HISTORICAL_PERIODS = 3;

/**
 * Row-level + cross-row validation pass (docs/07_VALIDATION_ENGINE.md §1
 * passes 2-3), consuming the `upload.validate` job `ParseService` enqueues
 * once structural validation + staging succeed. Same "runs outside any HTTP
 * request" tenant-context wiring as `ParseService` — see that class's doc
 * comment for why the job payload carries `hospitalId`/`organizationId`.
 *
 * `E_DUPLICATE_ROW`/`W_OUTLIER_NOMINAL` need historical confirmed data, but
 * `cost_entries`/`revenue_entries` (the eventual promotion target) don't
 * exist until Sprint 4 sub-task 6 — sourced instead from
 * `upload_rows_staging` rows already `promoted` by a prior batch for the
 * same hospital/type/period(s). This is accurate historical data regardless
 * of which table also holds it, and needs no rework once sub-task 6 lands
 * (the same rows will show up as promoted there too).
 */
@Injectable()
export class ValidateService {
  private readonly logger = new Logger(ValidateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService
  ) {}

  processValidate(payload: UploadValidateJobData): Promise<void> {
    return this.tenantContextService.runWithNewStore(async () => {
      this.tenantContextService.set({
        organizationId: payload.organizationId,
        hospitalId: payload.hospitalId,
        userId: payload.uploadedByUserId,
      });
      await this.run(payload);
    });
  }

  private async run(payload: UploadValidateJobData): Promise<void> {
    const batch = await this.prisma.uploadBatch.findUnique({
      where: { id: payload.uploadBatchId },
      include: { period: true },
    });
    // Idempotency guard, same rationale as ParseService's.
    if (!batch || batch.status !== "validating") {
      this.logger.warn(`Skipping validation for upload batch ${payload.uploadBatchId} — not in 'validating' status.`);
      return;
    }

    const rows = await this.prisma.uploadRowStaging.findMany({
      where: { uploadBatchId: batch.id },
      orderBy: { rowNumber: "asc" },
    });

    const rowRules = ROW_RULES[batch.type] ?? [];
    const naturalKeyFields = NATURAL_KEY_FIELDS[batch.type] ?? [];
    const outlierField = OUTLIER_FIELD[batch.type];
    const lookup = await this.buildLookup(payload.hospitalId);

    const issuesByRowId = new Map<string, ValidationIssue[]>();
    for (const row of rows) {
      const raw = row.rawJson as Record<string, string | number | null>;
      const issues = rowRules.flatMap((rule) => rule(raw, batch.period.label, lookup));
      issuesByRowId.set(row.id, issues);
    }

    this.applyDuplicateChecks(rows, issuesByRowId, naturalKeyFields, await this.fetchConfirmedKeys(payload.hospitalId, batch.type, batch.periodId, naturalKeyFields));

    if (outlierField) {
      await this.applyOutlierCheck(rows, issuesByRowId, payload.hospitalId, batch.type, batch.periodId, outlierField);
    }

    await this.persist(batch.id, rows, issuesByRowId);
  }

  private applyDuplicateChecks(
    rows: { id: string; rowNumber: number; rawJson: unknown }[],
    issuesByRowId: Map<string, ValidationIssue[]>,
    naturalKeyFields: string[],
    confirmedKeys: Set<string>
  ): void {
    if (naturalKeyFields.length === 0) return;
    const seenInBatch = new Map<string, number>();

    for (const row of rows) {
      const raw = row.rawJson as Record<string, string | number | null>;
      const key = naturalKeyFields.map((field) => String(raw[field] ?? "")).join("|");
      const issues = issuesByRowId.get(row.id)!;

      if (confirmedKeys.has(key)) {
        issues.push({
          errorCode: "E_DUPLICATE_ROW",
          message: `A row with this ${naturalKeyFields.join("+")} was already confirmed for this period in a prior upload.`,
          severity: "warning",
        });
      } else if (seenInBatch.has(key)) {
        issues.push({
          errorCode: "E_DUPLICATE_ROW",
          message: `Duplicate ${naturalKeyFields.join("+")} within this file (also row ${seenInBatch.get(key)}).`,
          severity: "warning",
        });
      } else {
        seenInBatch.set(key, row.rowNumber);
      }
    }
  }

  private async applyOutlierCheck(
    rows: { id: string; rawJson: unknown }[],
    issuesByRowId: Map<string, ValidationIssue[]>,
    hospitalId: string,
    type: UploadType,
    currentPeriodId: string,
    outlierField: string
  ): Promise<void> {
    const { values, periodsWithData } = await this.fetchHistoricalStats(hospitalId, type, currentPeriodId, outlierField);
    // docs/07_VALIDATION_ENGINE.md §3: fewer than 3 historical periods -> skip, not pass/fail.
    if (periodsWithData < OUTLIER_MIN_HISTORICAL_PERIODS || values.length === 0) return;

    const avg = mean(values);
    const sd = stddev(values, avg);
    if (sd === 0) return;

    const multiplier = await this.getOutlierMultiplier(hospitalId);

    for (const row of rows) {
      const raw = row.rawJson as Record<string, string | number | null>;
      const value = parseNumeric(raw[outlierField] ?? null);
      if (value === null) continue;
      if (Math.abs(value - avg) > multiplier * sd) {
        issuesByRowId.get(row.id)!.push({
          errorCode: "W_OUTLIER_NOMINAL",
          columnName: outlierField,
          message: `${outlierField} ${value} is more than ${multiplier}x the trailing-period standard deviation from the average (${avg.toFixed(2)}).`,
          severity: "warning",
        });
      }
    }
  }

  private async persist(
    uploadBatchId: string,
    rows: { id: string; rowNumber: number }[],
    issuesByRowId: Map<string, ValidationIssue[]>
  ): Promise<void> {
    const flatIssues: { rowNumber: number; issue: ValidationIssue }[] = [];
    const invalidRowIds: string[] = [];
    let errorCount = 0;

    for (const row of rows) {
      const issues = issuesByRowId.get(row.id) ?? [];
      const hasError = issues.some((issue) => issue.severity === "error");
      if (hasError) {
        invalidRowIds.push(row.id);
        errorCount += 1;
      }
      issues.forEach((issue) => flatIssues.push({ rowNumber: row.rowNumber, issue }));
    }

    const finalStatus = errorCount > 0 ? "failed" : "validated";

    this.tenantContextService.setManagedTransaction(true);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(tenantSessionSql(this.tenantContextService));
        if (flatIssues.length > 0) {
          await tx.validationError.createMany({
            data: flatIssues.map(({ rowNumber, issue }) => ({
              uploadBatchId,
              rowNumber,
              columnName: issue.columnName ?? null,
              errorCode: issue.errorCode,
              message: issue.message,
              severity: issue.severity,
            })),
          });
        }
        // Rows default to 'valid' at parse time (schema `@default`) — only the invalid ones need an update.
        if (invalidRowIds.length > 0) {
          await tx.uploadRowStaging.updateMany({ where: { id: { in: invalidRowIds } }, data: { status: "invalid" } });
        }
        await tx.uploadBatch.update({ where: { id: uploadBatchId }, data: { status: finalStatus, errorCount } });
      });
    } finally {
      this.tenantContextService.setManagedTransaction(false);
    }
  }

  private async buildLookup(hospitalId: string): Promise<MasterDataLookup> {
    const [costCenters, coaAccounts, profitCenters, services, drivers] = await Promise.all([
      this.prisma.costCenter.findMany({ where: { hospitalId, deletedAt: null }, select: { code: true } }),
      this.prisma.coaAccount.findMany({ where: { hospitalId, deletedAt: null }, select: { code: true } }),
      this.prisma.profitCenter.findMany({ where: { hospitalId, deletedAt: null }, select: { code: true } }),
      this.prisma.service.findMany({
        where: { hospitalId, deletedAt: null },
        select: { code: true, profitCenter: { select: { code: true } } },
      }),
      this.prisma.driver.findMany({ where: { hospitalId, deletedAt: null }, select: { code: true } }),
    ]);
    return {
      costCenterCodes: new Set(costCenters.map((c) => c.code)),
      coaAccountCodes: new Set(coaAccounts.map((c) => c.code)),
      profitCenterCodes: new Set(profitCenters.map((c) => c.code)),
      driverCodes: new Set(drivers.map((d) => d.code)),
      serviceProfitCenter: new Map(services.map((s) => [s.code, s.profitCenter.code])),
    };
  }

  private async fetchConfirmedKeys(
    hospitalId: string,
    type: UploadType,
    periodId: string,
    keyFields: string[]
  ): Promise<Set<string>> {
    if (keyFields.length === 0) return new Set();
    const priorRows = await this.prisma.uploadRowStaging.findMany({
      where: { status: "promoted", uploadBatch: { hospitalId, type, periodId } },
      select: { rawJson: true },
    });
    return new Set(
      priorRows.map((row) =>
        keyFields.map((field) => String((row.rawJson as Record<string, unknown>)[field] ?? "")).join("|")
      )
    );
  }

  private async fetchHistoricalStats(
    hospitalId: string,
    type: UploadType,
    currentPeriodId: string,
    field: string
  ): Promise<{ values: number[]; periodsWithData: number }> {
    const currentPeriod = await this.prisma.period.findUnique({ where: { id: currentPeriodId } });
    if (!currentPeriod) return { values: [], periodsWithData: 0 };

    const historicalPeriods = await this.prisma.period.findMany({
      where: { hospitalId, startDate: { lt: currentPeriod.startDate } },
      orderBy: { startDate: "desc" },
      take: OUTLIER_TRAILING_PERIODS,
      select: { id: true },
    });
    if (historicalPeriods.length === 0) return { values: [], periodsWithData: 0 };

    const rows = await this.prisma.uploadRowStaging.findMany({
      where: {
        status: "promoted",
        uploadBatch: { hospitalId, type, periodId: { in: historicalPeriods.map((p) => p.id) } },
      },
      select: { rawJson: true, uploadBatch: { select: { periodId: true } } },
    });

    const values = rows
      .map((row) => parseNumeric((row.rawJson as Record<string, unknown>)[field] as string | number | null))
      .filter((value): value is number => value !== null);
    const periodsWithData = new Set(rows.map((row) => row.uploadBatch.periodId)).size;

    return { values, periodsWithData };
  }

  private async getOutlierMultiplier(hospitalId: string): Promise<number> {
    const settings = await this.prisma.hospitalSettings.findUnique({ where: { hospitalId } });
    return settings ? Number(settings.outlierStddevMultiplier) : 3;
  }
}
