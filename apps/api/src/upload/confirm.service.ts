import { ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { UploadType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantSessionSql } from "../prisma/tenant-session.sql";
import { AuditContextService } from "../audit/audit-context.service";
import { parseNumeric } from "./validation-issue";
import { UPLOAD_BATCH_SELECT, uploadNotFound } from "./upload.service";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";
import type { UploadResponseDto } from "./dto/upload-response.dto";

interface CodeLookup {
  costCenterCodeToId: Map<string, string>;
  coaAccountCodeToId: Map<string, string>;
  profitCenterCodeToId: Map<string, string>;
  serviceCodeToId: Map<string, string>;
  driverCodeToId: Map<string, string>;
}

function notConfirmable(status: string): ConflictException {
  return new ConflictException({
    code: "UPLOAD_NOT_CONFIRMABLE",
    message: `Upload batch is '${status}', not 'validated'.`,
  });
}

function notRollbackable(status: string): ConflictException {
  return new ConflictException({
    code: "UPLOAD_NOT_ROLLBACKABLE",
    message: `Upload batch is '${status}', not 'confirmed'.`,
  });
}

function periodNotOpen(action: "confirm" | "roll back", periodLabel: string, periodStatus: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: "PERIOD_NOT_OPEN",
    message: `Cannot ${action} — period '${periodLabel}' is '${periodStatus}', not open.`,
  });
}

function warningsNotAcknowledged(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: "UPLOAD_WARNINGS_NOT_ACKNOWLEDGED",
    message: "This batch has warning-severity issues — resubmit with acknowledged: true to confirm anyway.",
  });
}

function promotionReferenceMissing(rowNumber: number): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: "UPLOAD_PROMOTION_REFERENCE_MISSING",
    message: `Row ${rowNumber}: referenced master data no longer exists (it may have changed since validation).`,
  });
}

/**
 * Pipeline steps 6-7 (docs/06_UPLOAD_ENGINE.md §2): promote valid staged
 * rows into `CostEntry`/`RevenueEntry`, or undo a prior promotion.
 * `UploadService` owns intake/read; this owns the two financial-data-writing
 * actions specifically, kept in their own class the same way `ParseService`/
 * `ValidateService` are split out from `UploadService`.
 *
 * Confirm re-resolves every row's master-data codes to ids AT CONFIRM TIME —
 * not reusing whatever `ValidateService` saw — and does so per-row, INSIDE
 * the promotion transaction, one `create()` per row rather than a single
 * `createMany()`. Both choices exist for the same reason: if a code was
 * deleted between validate and confirm, the row that references it fails
 * (and rolls back) at the exact point real concurrent modification could
 * cause it, not from a stale pre-check — "all-or-nothing" backed by
 * Postgres's own transaction rollback, not just an upfront guess
 * (docs/06_UPLOAD_ENGINE.md §2: "Confirmation runs inside a single DB
 * transaction: either all valid staged rows are promoted... or none are").
 */
@Injectable()
export class ConfirmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly auditContextService: AuditContextService
  ) {}

  async confirm(
    hospitalId: string,
    uploadBatchId: string,
    dto: ConfirmUploadDto,
    actorUserId: string
  ): Promise<UploadResponseDto> {
    const batch = await this.prisma.uploadBatch.findFirst({
      where: { id: uploadBatchId, hospitalId },
      include: { period: true },
    });
    if (!batch) throw uploadNotFound();
    if (batch.status !== "validated") throw notConfirmable(batch.status);
    if (batch.period.status !== "open") {
      throw periodNotOpen("confirm", batch.period.label, batch.period.status);
    }

    const hasWarnings =
      (await this.prisma.validationError.count({ where: { uploadBatchId, severity: "warning" } })) > 0;
    if (hasWarnings && !dto.acknowledged) throw warningsNotAcknowledged();

    const validRows = await this.prisma.uploadRowStaging.findMany({
      where: { uploadBatchId, status: "valid" },
      orderBy: { rowNumber: "asc" },
    });
    const lookup = await this.buildCodeLookup(hospitalId, batch.type);

    this.tenantContextService.setManagedTransaction(true);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(tenantSessionSql(this.tenantContextService));

        for (const row of validRows) {
          const raw = row.rawJson as Record<string, string | number | null>;
          if (batch.type === "cost") {
            const costCenterId = lookup.costCenterCodeToId.get(String(raw.cost_center_code));
            const coaAccountId = lookup.coaAccountCodeToId.get(String(raw.coa_account_code));
            if (!costCenterId || !coaAccountId) throw promotionReferenceMissing(row.rowNumber);
            await tx.costEntry.create({
              data: {
                hospitalId,
                periodId: batch.periodId,
                costCenterId,
                coaAccountId,
                nominal: parseNumeric(raw.nominal ?? null) ?? 0,
                sourceFileId: batch.id,
              },
            });
          } else if (batch.type === "revenue") {
            const profitCenterId = lookup.profitCenterCodeToId.get(String(raw.profit_center_code));
            const serviceId = lookup.serviceCodeToId.get(String(raw.service_code));
            if (!profitCenterId || !serviceId) throw promotionReferenceMissing(row.rowNumber);
            await tx.revenueEntry.create({
              data: {
                hospitalId,
                periodId: batch.periodId,
                profitCenterId,
                serviceId,
                volume: parseNumeric(raw.volume ?? null) ?? 0,
                revenue: parseNumeric(raw.revenue ?? null) ?? 0,
                sourceFileId: batch.id,
              },
            });
          } else if (batch.type === "driver") {
            const driverId = lookup.driverCodeToId.get(String(raw.driver_code));
            // `target_type` picks which of the two polymorphic FKs resolves —
            // exactly one of these two lookups is even attempted, matching
            // the DB's own "exactly one set" CHECK constraint.
            const targetCostCenterId =
              raw.target_type === "cost_center" ? lookup.costCenterCodeToId.get(String(raw.target_code)) : undefined;
            const targetProfitCenterId =
              raw.target_type === "profit_center"
                ? lookup.profitCenterCodeToId.get(String(raw.target_code))
                : undefined;
            if (!driverId || (!targetCostCenterId && !targetProfitCenterId)) {
              throw promotionReferenceMissing(row.rowNumber);
            }
            await tx.driverValue.create({
              data: {
                hospitalId,
                periodId: batch.periodId,
                driverId,
                targetCostCenterId: targetCostCenterId ?? null,
                targetProfitCenterId: targetProfitCenterId ?? null,
                value: parseNumeric(raw.value ?? null) ?? 0,
                sourceFileId: batch.id,
              },
            });
          }
        }

        if (validRows.length > 0) {
          await tx.uploadRowStaging.updateMany({
            where: { id: { in: validRows.map((row) => row.id) } },
            data: { status: "promoted" },
          });
        }

        await tx.uploadBatch.update({ where: { id: batch.id }, data: { status: "confirmed", confirmedAt: new Date() } });
      });
    } finally {
      this.tenantContextService.setManagedTransaction(false);
    }

    this.auditContextService.record({
      entity: "upload",
      action: "upload.confirm",
      entityId: batch.id,
      userId: actorUserId,
      before: { status: "validated" },
      after: { status: "confirmed", promotedRowCount: validRows.length },
    });

    return this.reload(hospitalId, batch.id);
  }

  async rollback(hospitalId: string, uploadBatchId: string, actorUserId: string): Promise<UploadResponseDto> {
    const batch = await this.prisma.uploadBatch.findFirst({
      where: { id: uploadBatchId, hospitalId },
      include: { period: true },
    });
    if (!batch) throw uploadNotFound();
    if (batch.status !== "confirmed") throw notRollbackable(batch.status);
    // docs/01_BUSINESS_RULES.md §5: "Rollback is only permitted while the period is open."
    if (batch.period.status !== "open") {
      throw periodNotOpen("roll back", batch.period.label, batch.period.status);
    }

    this.tenantContextService.setManagedTransaction(true);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(tenantSessionSql(this.tenantContextService));

        if (batch.type === "cost") {
          await tx.costEntry.deleteMany({ where: { sourceFileId: batch.id } });
        } else if (batch.type === "revenue") {
          await tx.revenueEntry.deleteMany({ where: { sourceFileId: batch.id } });
        } else if (batch.type === "driver") {
          await tx.driverValue.deleteMany({ where: { sourceFileId: batch.id } });
        }

        // The row itself was fine (it passed validation) — it's just no
        // longer reflected in the live tables. `upload_row_status` has no
        // dedicated "rolled back" value, so reverting to `valid` is the
        // correct read within the existing 3-value enum.
        await tx.uploadRowStaging.updateMany({
          where: { uploadBatchId: batch.id, status: "promoted" },
          data: { status: "valid" },
        });

        await tx.uploadBatch.update({
          where: { id: batch.id },
          data: { status: "rolled_back", rolledBackAt: new Date() },
        });

        // docs/01_BUSINESS_RULES.md §5: rollback invalidates every
        // allocation_run for the affected period by marking it stale —
        // never deleted/mutated otherwise, still viewable for audit, but
        // the dashboard must fall back to the latest non-stale run.
        await tx.allocationRun.updateMany({
          where: { periodId: batch.periodId, isStale: false },
          data: { isStale: true, staleAt: new Date() },
        });
      });
    } finally {
      this.tenantContextService.setManagedTransaction(false);
    }

    this.auditContextService.record({
      entity: "upload",
      action: "upload.rollback",
      entityId: batch.id,
      userId: actorUserId,
      before: { status: "confirmed" },
      after: { status: "rolled_back" },
    });

    return this.reload(hospitalId, batch.id);
  }

  private async buildCodeLookup(hospitalId: string, type: UploadType): Promise<CodeLookup> {
    const empty: CodeLookup = {
      costCenterCodeToId: new Map(),
      coaAccountCodeToId: new Map(),
      profitCenterCodeToId: new Map(),
      serviceCodeToId: new Map(),
      driverCodeToId: new Map(),
    };

    if (type === "cost") {
      const [costCenters, coaAccounts] = await Promise.all([
        this.prisma.costCenter.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true, code: true } }),
        this.prisma.coaAccount.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true, code: true } }),
      ]);
      return {
        ...empty,
        costCenterCodeToId: new Map(costCenters.map((c) => [c.code, c.id])),
        coaAccountCodeToId: new Map(coaAccounts.map((c) => [c.code, c.id])),
      };
    }

    if (type === "revenue") {
      const [profitCenters, services] = await Promise.all([
        this.prisma.profitCenter.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true, code: true } }),
        this.prisma.service.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true, code: true } }),
      ]);
      return {
        ...empty,
        profitCenterCodeToId: new Map(profitCenters.map((c) => [c.code, c.id])),
        serviceCodeToId: new Map(services.map((s) => [s.code, s.id])),
      };
    }

    // "driver" rows can target either a cost center or a profit center
    // (docs/08_COST_ALLOCATION_ENGINE.md §2's step-down flow) — needs both
    // lookups plus the driver catalog itself.
    const [costCenters, profitCenters, drivers] = await Promise.all([
      this.prisma.costCenter.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true, code: true } }),
      this.prisma.profitCenter.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true, code: true } }),
      this.prisma.driver.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true, code: true } }),
    ]);
    return {
      ...empty,
      costCenterCodeToId: new Map(costCenters.map((c) => [c.code, c.id])),
      profitCenterCodeToId: new Map(profitCenters.map((c) => [c.code, c.id])),
      driverCodeToId: new Map(drivers.map((d) => [d.code, d.id])),
    };
  }

  private async reload(hospitalId: string, id: string): Promise<UploadResponseDto> {
    return this.prisma.uploadBatch.findFirstOrThrow({ where: { id, hospitalId }, select: UPLOAD_BATCH_SELECT });
  }
}
