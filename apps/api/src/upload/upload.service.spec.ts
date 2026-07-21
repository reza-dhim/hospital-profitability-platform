import { BadRequestException, NotFoundException, NotImplementedException, UnprocessableEntityException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { UploadService } from "./upload.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";
import type { UploadQueueService } from "../queue/upload-queue.service";
import type { PeriodService } from "../period/period.service";
import type { VirusScanner } from "./virus-scanner";

const openPeriod = { id: "period-1", hospitalId: "hospital-1", label: "2026-01", status: "open" };

async function makeValidXlsxFile(overrides: Partial<Express.Multer.File> = {}): Promise<Express.Multer.File> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Data");
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    originalname: "cost-2026-01.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.length,
    buffer,
    ...overrides,
  } as Express.Multer.File;
}

function makeDeps() {
  const prisma = {
    hospitalSettings: { findUnique: jest.fn().mockResolvedValue({ maxUploadFileSizeMb: 25 }) },
    uploadBatch: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    uploadRowStaging: { count: jest.fn() },
    validationError: { count: jest.fn(), findMany: jest.fn() },
  } as unknown as PrismaService;

  const storageService = {
    buildUploadKey: jest.fn((org: string, hospital: string, id: string) => `${org}/${hospital}/uploads/${id}.xlsx`),
    putObject: jest.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;

  const uploadQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService;

  const periodService = { findOne: jest.fn().mockResolvedValue(openPeriod) } as unknown as PeriodService;

  const virusScanner = { scan: jest.fn().mockResolvedValue({ clean: true }) } as unknown as VirusScanner;

  return { prisma, storageService, uploadQueueService, periodService, virusScanner };
}

describe("UploadService.create", () => {
  it("rejects an unsupported upload type before touching the period, storage, or DB", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile();

    // Every `UploadType` enum value is supported as of Sprint 8 — this
    // proves the rejection branch itself still works by bypassing the type
    // system, the same way a stale/future enum value not yet added to
    // `SUPPORTED_UPLOAD_TYPES` would reach this check.
    await expect(
      service.create("hospital-1", "org-1", "not_a_real_type" as never, { periodId: "period-1" }, file, "actor-1")
    ).rejects.toBeInstanceOf(NotImplementedException);
    expect(periodService.findOne).not.toHaveBeenCalled();
  });

  it("rejects an upload when the target period is not open", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (periodService.findOne as jest.Mock).mockResolvedValue({ ...openPeriod, status: "locked" });
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile();

    const error = await service
      .create("hospital-1", "org-1", "cost", { periodId: "period-1" }, file, "actor-1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: "PERIOD_NOT_OPEN" });
    expect(storageService.putObject).not.toHaveBeenCalled();
  });

  it("rejects a file larger than the hospital's configured limit", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.hospitalSettings.findUnique as jest.Mock).mockResolvedValue({ maxUploadFileSizeMb: 1 });
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile({ size: 2 * 1024 * 1024 });

    const error = await service
      .create("hospital-1", "org-1", "cost", { periodId: "period-1" }, file, "actor-1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: "E_FILE_TOO_LARGE" });
    expect(storageService.putObject).not.toHaveBeenCalled();
  });

  it("defaults the size limit to 25MB when no hospital_settings row exists yet", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.hospitalSettings.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.uploadBatch.create as jest.Mock).mockResolvedValue({ id: "batch-1", status: "staged" });
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile({ size: 10 * 1024 * 1024 });

    await expect(
      service.create("hospital-1", "org-1", "cost", { periodId: "period-1" }, file, "actor-1")
    ).resolves.toMatchObject({ id: "batch-1" });
  });

  it("rejects a file that isn't a valid xlsx, not just by extension", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile({ buffer: Buffer.from("not really an xlsx") });

    const error = await service
      .create("hospital-1", "org-1", "cost", { periodId: "period-1" }, file, "actor-1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: "E_FILE_FORMAT" });
    expect(storageService.putObject).not.toHaveBeenCalled();
  });

  it("stores a clean file, creates a staged upload_batches row, and enqueues the parse job", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.uploadBatch.create as jest.Mock).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...data })
    );
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile();

    const result = await service.create("hospital-1", "org-1", "cost", { periodId: "period-1" }, file, "actor-1");

    expect(storageService.buildUploadKey).toHaveBeenCalledWith("org-1", "hospital-1", expect.any(String));
    expect(storageService.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^org-1\/hospital-1\/uploads\/.+\.xlsx$/),
      file.buffer,
      file.mimetype
    );
    expect(prisma.uploadBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hospitalId: "hospital-1",
          type: "cost",
          periodId: "period-1",
          fileName: "cost-2026-01.xlsx",
          uploadedByUserId: "actor-1",
          status: "staged",
        }),
      })
    );
    expect(uploadQueueService.enqueue).toHaveBeenCalledWith("upload.parse", {
      uploadBatchId: result.id,
      hospitalId: "hospital-1",
      organizationId: "org-1",
      uploadedByUserId: "actor-1",
    });
  });

  it("never exposes fileUrl in the created row's select", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.uploadBatch.create as jest.Mock).mockResolvedValue({ id: "batch-1" });
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile();

    await service.create("hospital-1", "org-1", "cost", { periodId: "period-1" }, file, "actor-1");

    const call = (prisma.uploadBatch.create as jest.Mock).mock.calls[0][0];
    expect(call.select.fileUrl).toBeUndefined();
  });

  it("rejects an infected file with a failed status row and skips storage entirely", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (virusScanner.scan as jest.Mock).mockResolvedValue({ clean: false });
    (prisma.uploadBatch.create as jest.Mock).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...data })
    );
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);
    const file = await makeValidXlsxFile();

    const result = await service.create("hospital-1", "org-1", "cost", { periodId: "period-1" }, file, "actor-1");

    expect(result.status).toBe("failed");
    expect(storageService.putObject).not.toHaveBeenCalled();
    expect(uploadQueueService.enqueue).not.toHaveBeenCalled();
  });
});

describe("UploadService.findOne", () => {
  it("throws NotFoundException when the batch doesn't exist in this hospital", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);

    await expect(service.findOne("hospital-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UploadService.findAll", () => {
  it("scopes by hospital and applies optional type/status filters", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.uploadBatch.findMany as jest.Mock).mockResolvedValue([{ id: "batch-1" }]);
    (prisma.uploadBatch.count as jest.Mock).mockResolvedValue(1);
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);

    const result = await service.findAll("hospital-1", { page: 1, limit: 20, type: "cost", status: "staged" });

    expect(prisma.uploadBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hospitalId: "hospital-1", type: "cost", status: "staged" } })
    );
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });
});

describe("UploadService.getValidationResult", () => {
  it("computes summary counts and maps errors to the documented contract shape", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ id: "batch-1", status: "failed" });
    (prisma.uploadRowStaging.count as jest.Mock).mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("status" in where ? 2 : 10)
    );
    (prisma.validationError.count as jest.Mock).mockResolvedValue(3);
    (prisma.validationError.findMany as jest.Mock).mockImplementation(({ select }: { select?: object }) =>
      select
        ? Promise.resolve([{ rowNumber: 4 }, { rowNumber: 5 }])
        : Promise.resolve([
            { rowNumber: 4, columnName: "cost_center_code", errorCode: "E_INVALID_COST_CENTER", severity: "error", message: "not found" },
          ])
    );
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);

    const result = await service.getValidationResult("hospital-1", "batch-1", { page: 1, limit: 200 });

    expect(result.uploadBatchId).toBe("batch-1");
    expect(result.status).toBe("failed");
    expect(result.summary).toEqual({ totalRows: 10, validRows: 8, errorRows: 2, warningRows: 2 });
    expect(result.errors).toEqual([
      { rowNumber: 4, column: "cost_center_code", code: "E_INVALID_COST_CENTER", severity: "error", message: "not found" },
    ]);
    expect(result.meta).toEqual({ page: 1, limit: 200, total: 3 });
  });

  it("throws NotFoundException when the batch doesn't exist in this hospital", async () => {
    const { prisma, storageService, uploadQueueService, periodService, virusScanner } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new UploadService(prisma, storageService, uploadQueueService, periodService, virusScanner);

    await expect(service.getValidationResult("hospital-1", "missing", { page: 1, limit: 20 })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
