import ExcelJS from "exceljs";
import { ParseService } from "./parse.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { TEMPLATE_VERSION } from "./template-specs";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";
import type { UploadQueueService } from "../queue/upload-queue.service";

const COST_HEADERS = ["period", "cost_center_code", "coa_account_code", "nominal"];
const VERSION_MARKER = `TEMPLATE_VERSION:${TEMPLATE_VERSION}`;

async function buildWorkbookBuffer(options: {
  versionMarker?: string;
  headers?: string[];
  dataRows?: (string | number | null)[][];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");

  const versionRow = sheet.getRow(1);
  versionRow.getCell(1).value = options.versionMarker ?? VERSION_MARKER;
  versionRow.hidden = true;

  const headerRow = sheet.getRow(2);
  (options.headers ?? COST_HEADERS).forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });

  (options.dataRows ?? []).forEach((rowValues, rowIndex) => {
    const row = sheet.getRow(3 + rowIndex);
    rowValues.forEach((value, colIndex) => {
      row.getCell(colIndex + 1).value = value;
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const stagedBatch = { id: "batch-1", type: "cost", fileUrl: "org-1/hospital-1/uploads/batch-1.xlsx", status: "staged" };

function makeDeps() {
  const tx = {
    $executeRaw: jest.fn(),
    validationError: { createMany: jest.fn() },
    uploadBatch: { update: jest.fn() },
  };
  const prisma = {
    uploadBatch: {
      findUnique: jest.fn().mockResolvedValue(stagedBatch),
      update: jest.fn().mockResolvedValue({}),
    },
    uploadRowStaging: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;

  const storageService = { getObject: jest.fn() } as unknown as StorageService;
  const uploadQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService;
  const tenantContextService = new TenantContextService();

  return { prisma, tx, storageService, uploadQueueService, tenantContextService };
}

const payload = { uploadBatchId: "batch-1", hospitalId: "hospital-1", organizationId: "org-1", uploadedByUserId: "user-1" };

describe("ParseService.processUpload", () => {
  it("is a no-op when the batch is not in 'staged' status (idempotency guard)", async () => {
    const { prisma, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (prisma.uploadBatch.findUnique as jest.Mock).mockResolvedValue({ ...stagedBatch, status: "validating" });
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);

    expect(storageService.getObject).not.toHaveBeenCalled();
    expect(prisma.uploadBatch.update).not.toHaveBeenCalled();
  });

  it("is a no-op when the batch no longer exists", async () => {
    const { prisma, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (prisma.uploadBatch.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);
    expect(storageService.getObject).not.toHaveBeenCalled();
  });

  it("fails the batch with E_TEMPLATE_VERSION when the version marker doesn't match", async () => {
    const { prisma, tx, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (storageService.getObject as jest.Mock).mockResolvedValue(
      await buildWorkbookBuffer({ versionMarker: "TEMPLATE_VERSION:v0" })
    );
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);

    expect(tx.validationError.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ uploadBatchId: "batch-1", errorCode: "E_TEMPLATE_VERSION", severity: "error" })],
      })
    );
    expect(tx.uploadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { status: "failed", errorCount: 1 },
    });
    expect(uploadQueueService.enqueue).not.toHaveBeenCalled();
  });

  it("fails the batch with E_REQUIRED_COLUMN_MISSING for each mismatched header, when the version marker is correct", async () => {
    const { tx, prisma, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (storageService.getObject as jest.Mock).mockResolvedValue(
      await buildWorkbookBuffer({ headers: ["period", "wrong_column", "coa_account_code", "nominal"] })
    );
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);

    const call = (tx.validationError.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data).toHaveLength(1);
    expect(call.data[0]).toMatchObject({ errorCode: "E_REQUIRED_COLUMN_MISSING", columnName: "cost_center_code" });
  });

  it("fails the batch with E_FILE_FORMAT when the stored bytes aren't a valid xlsx", async () => {
    const { tx, prisma, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (storageService.getObject as jest.Mock).mockResolvedValue(Buffer.from("not an xlsx"));
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);

    expect(tx.validationError.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ errorCode: "E_FILE_FORMAT" })] })
    );
  });

  it("parses valid data rows into upload_rows_staging, sets rowCount, and enqueues upload.validate", async () => {
    const { prisma, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (storageService.getObject as jest.Mock).mockResolvedValue(
      await buildWorkbookBuffer({
        dataRows: [
          ["2026-01", "CC-1", "COA-1", 1_000_000],
          ["2026-01", "CC-2", "COA-2", 2_000_000],
        ],
      })
    );
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);

    expect(prisma.uploadBatch.update).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: { status: "validating" } });
    expect(prisma.uploadRowStaging.createMany).toHaveBeenCalledWith({
      data: [
        {
          uploadBatchId: "batch-1",
          rowNumber: 1,
          rawJson: { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1_000_000 },
        },
        {
          uploadBatchId: "batch-1",
          rowNumber: 2,
          rawJson: { period: "2026-01", cost_center_code: "CC-2", coa_account_code: "COA-2", nominal: 2_000_000 },
        },
      ],
    });
    expect(prisma.uploadBatch.update).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: { rowCount: 2 } });
    expect(uploadQueueService.enqueue).toHaveBeenCalledWith("upload.validate", payload);
  });

  it("skips fully-blank trailing rows", async () => {
    const { prisma, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (storageService.getObject as jest.Mock).mockResolvedValue(
      await buildWorkbookBuffer({
        dataRows: [
          ["2026-01", "CC-1", "COA-1", 1000],
          [null, null, null, null],
        ],
      })
    );
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);

    const call = (prisma.uploadRowStaging.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data).toHaveLength(1);
  });

  it("neutralizes a formula-injection-looking cell value rather than leaving it evaluable downstream", async () => {
    const { prisma, storageService, uploadQueueService, tenantContextService } = makeDeps();
    (storageService.getObject as jest.Mock).mockResolvedValue(
      await buildWorkbookBuffer({ dataRows: [["2026-01", "=cmd|'/c calc'!A1", "COA-1", 1000]] })
    );
    const service = new ParseService(prisma, storageService, uploadQueueService, tenantContextService);

    await service.processUpload(payload);

    const call = (prisma.uploadRowStaging.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data[0].rawJson.cost_center_code).toBe("'=cmd|'/c calc'!A1");
  });
});
