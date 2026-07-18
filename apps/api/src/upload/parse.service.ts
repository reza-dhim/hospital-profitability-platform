import { Injectable, Logger } from "@nestjs/common";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { UploadQueueService } from "../queue/upload-queue.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantSessionSql } from "../prisma/tenant-session.sql";
import { TEMPLATE_SPECS, TEMPLATE_VERSION } from "./template-specs";
import { cellTextValue } from "./cell-value.util";

export interface UploadParseJobData {
  uploadBatchId: string;
  hospitalId: string;
  organizationId: string;
  uploadedByUserId: string;
}

interface StructuralError {
  errorCode: string;
  message: string;
  columnName?: string;
}

const EXPECTED_VERSION_MARKER = `TEMPLATE_VERSION:${TEMPLATE_VERSION}`;
const HEADER_ROW_NUMBER = 2;
const FIRST_DATA_ROW_NUMBER = 3;

/**
 * Pipeline steps 3-4's structural pass (docs/06_UPLOAD_ENGINE.md §2,
 * docs/07_VALIDATION_ENGINE.md §1: "Structural — file/format level, applies
 * before row parsing"). Row-level/cross-row validation (Sprint 4 sub-task 5)
 * consumes the `upload.validate` job this enqueues on success — it doesn't
 * run here, matching the pipeline diagram's own step boundary (parse & stage
 * is one async stage, validate is the next).
 *
 * Runs inside a BullMQ worker, not an HTTP request — there is no
 * `TenantContextService` store open the way `TenantMiddleware` opens one per
 * request, so `processUpload()` opens its own store and sets the tenant
 * context directly from the job payload (the enqueuing request already knew
 * `hospitalId`/`organizationId` — no lookup-before-tenant-is-known problem
 * like login has, so no `auth_bypass`-style escape hatch is needed here).
 */
@Injectable()
export class ParseService {
  private readonly logger = new Logger(ParseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly uploadQueueService: UploadQueueService,
    private readonly tenantContextService: TenantContextService
  ) {}

  processUpload(payload: UploadParseJobData): Promise<void> {
    return this.tenantContextService.runWithNewStore(async () => {
      this.tenantContextService.set({
        organizationId: payload.organizationId,
        hospitalId: payload.hospitalId,
        userId: payload.uploadedByUserId,
      });
      await this.run(payload);
    });
  }

  private async run(payload: UploadParseJobData): Promise<void> {
    const batch = await this.prisma.uploadBatch.findUnique({ where: { id: payload.uploadBatchId } });
    // Idempotency guard: a batch already past `staged` (re-delivered job, manual re-run, etc.) is a no-op, not an error.
    if (!batch || batch.status !== "staged") {
      this.logger.warn(`Skipping parse for upload batch ${payload.uploadBatchId} — not in 'staged' status.`);
      return;
    }

    await this.prisma.uploadBatch.update({ where: { id: batch.id }, data: { status: "validating" } });

    const spec = TEMPLATE_SPECS[batch.type];
    if (!spec) {
      // SUPPORTED_UPLOAD_TYPES already gates this at intake (upload.service.ts) — defensive only.
      await this.failBatch(batch.id, [
        { errorCode: "E_TEMPLATE_VERSION", message: `No template spec exists for upload type '${batch.type}'.` },
      ]);
      return;
    }

    const fileBuffer = await this.storageService.getObject(batch.fileUrl);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as never);
    } catch {
      await this.failBatch(batch.id, [
        { errorCode: "E_FILE_FORMAT", message: "The stored file could not be parsed as a valid .xlsx workbook." },
      ]);
      return;
    }

    const sheet = workbook.getWorksheet("Data");
    if (!sheet) {
      await this.failBatch(batch.id, [
        { errorCode: "E_REQUIRED_COLUMN_MISSING", message: "Expected worksheet 'Data' was not found in the file." },
      ]);
      return;
    }

    const structuralErrors = this.checkStructure(sheet, spec.columns.map((c) => c.header));
    if (structuralErrors.length > 0) {
      await this.failBatch(batch.id, structuralErrors);
      return;
    }

    const rows = this.extractRows(sheet, spec.columns.map((c) => c.header));
    if (rows.length > 0) {
      await this.prisma.uploadRowStaging.createMany({
        data: rows.map((row) => ({
          uploadBatchId: batch.id,
          rowNumber: row.rowNumber,
          rawJson: row.rawJson as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.uploadBatch.update({ where: { id: batch.id }, data: { rowCount: rows.length } });

    await this.uploadQueueService.enqueue("upload.validate", {
      uploadBatchId: batch.id,
      hospitalId: payload.hospitalId,
      organizationId: payload.organizationId,
      uploadedByUserId: payload.uploadedByUserId,
    });
  }

  private checkStructure(sheet: ExcelJS.Worksheet, expectedHeaders: string[]): StructuralError[] {
    const errors: StructuralError[] = [];

    const versionValue = cellTextValue(sheet.getRow(1).getCell(1));
    if (versionValue !== EXPECTED_VERSION_MARKER) {
      errors.push({
        errorCode: "E_TEMPLATE_VERSION",
        message: `Expected template version marker '${EXPECTED_VERSION_MARKER}', found '${versionValue ?? "(empty)"}'. Please download a fresh template.`,
      });
      // A stale/wrong template makes column-position checks unreliable — short-circuit (docs/07_VALIDATION_ENGINE.md §1).
      return errors;
    }

    const headerRow = sheet.getRow(HEADER_ROW_NUMBER);
    expectedHeaders.forEach((expected, index) => {
      const actual = cellTextValue(headerRow.getCell(index + 1));
      if (actual !== expected) {
        errors.push({
          errorCode: "E_REQUIRED_COLUMN_MISSING",
          columnName: expected,
          message: `Expected column '${expected}' at position ${index + 1}, found '${actual ?? "(empty)"}'.`,
        });
      }
    });

    return errors;
  }

  private extractRows(
    sheet: ExcelJS.Worksheet,
    columns: string[]
  ): { rowNumber: number; rawJson: Record<string, string | number | null> }[] {
    const rows: { rowNumber: number; rawJson: Record<string, string | number | null> }[] = [];
    let dataRowNumber = 0;

    sheet.eachRow((row, sheetRowNumber) => {
      if (sheetRowNumber < FIRST_DATA_ROW_NUMBER) return;

      const rawJson: Record<string, string | number | null> = {};
      let hasAnyValue = false;
      columns.forEach((column, index) => {
        const value = cellTextValue(row.getCell(index + 1));
        if (value !== null && value !== "") hasAnyValue = true;
        rawJson[column] = value;
      });

      if (!hasAnyValue) return; // fully-blank trailing row — not real data.
      dataRowNumber += 1;
      rows.push({ rowNumber: dataRowNumber, rawJson });
    });

    return rows;
  }

  /** Atomic: the batch never ends up `failed` with a mismatched `error_count`, or vice versa. */
  private async failBatch(uploadBatchId: string, errors: StructuralError[]): Promise<void> {
    this.tenantContextService.setManagedTransaction(true);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(tenantSessionSql(this.tenantContextService));
        await tx.validationError.createMany({
          data: errors.map((error) => ({
            uploadBatchId,
            errorCode: error.errorCode,
            message: error.message,
            columnName: error.columnName ?? null,
            severity: "error",
          })),
        });
        await tx.uploadBatch.update({
          where: { id: uploadBatchId },
          data: { status: "failed", errorCount: errors.length },
        });
      });
    } finally {
      this.tenantContextService.setManagedTransaction(false);
    }
  }
}
