import { ValidateService } from "./validate.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import type { PrismaService } from "../prisma/prisma.service";

const payload = { uploadBatchId: "batch-1", hospitalId: "hospital-1", organizationId: "org-1", uploadedByUserId: "user-1" };

const validatingCostBatch = {
  id: "batch-1",
  type: "cost",
  periodId: "period-1",
  status: "validating",
  period: { id: "period-1", label: "2026-01", startDate: new Date("2026-01-01") },
};

function costRow(id: string, rowNumber: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    rowNumber,
    rawJson: { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000, ...overrides },
  };
}

function makeDeps() {
  const tx = {
    $executeRaw: jest.fn(),
    validationError: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    uploadRowStaging: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    uploadBatch: { update: jest.fn().mockResolvedValue({}) },
  };

  // Distinguishes the 3 distinct `uploadRowStaging.findMany` call shapes
  // ValidateService issues: (1) this batch's own rows, (2) same-period
  // "confirmed" duplicates, (3) historical-period outlier data.
  const uploadRowStagingFindMany = jest.fn((args: { where: Record<string, unknown> }) => {
    if ("uploadBatchId" in args.where) return Promise.resolve([]); // overridden per-test
    const uploadBatchWhere = args.where.uploadBatch as { periodId: unknown } | undefined;
    if (uploadBatchWhere && typeof uploadBatchWhere.periodId === "object") {
      return Promise.resolve([]); // historical (periodId: { in: [...] })
    }
    return Promise.resolve([]); // same-period confirmed duplicates
  });

  const prisma = {
    uploadBatch: { findUnique: jest.fn().mockResolvedValue(validatingCostBatch) },
    uploadRowStaging: { findMany: uploadRowStagingFindMany },
    costCenter: { findMany: jest.fn().mockResolvedValue([{ code: "CC-1" }]) },
    coaAccount: { findMany: jest.fn().mockResolvedValue([{ code: "COA-1" }]) },
    profitCenter: { findMany: jest.fn().mockResolvedValue([]) },
    service: { findMany: jest.fn().mockResolvedValue([]) },
    driver: { findMany: jest.fn().mockResolvedValue([]) },
    hospitalSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    period: { findUnique: jest.fn().mockResolvedValue(validatingCostBatch.period), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;

  return { prisma, tx, tenantContextService: new TenantContextService() };
}

describe("ValidateService.processValidate", () => {
  it("is a no-op when the batch is not in 'validating' status", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.uploadBatch.findUnique as jest.Mock).mockResolvedValue({ ...validatingCostBatch, status: "staged" });
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    expect(prisma.uploadRowStaging.findMany).not.toHaveBeenCalled();
    expect(tx.uploadBatch.update).not.toHaveBeenCalled();
  });

  it("marks the batch 'validated' with no errorCount when every row passes", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve("uploadBatchId" in args.where ? [costRow("row-1", 1)] : [])
    );
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    expect(tx.uploadBatch.update).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: { status: "validated", errorCount: 0 } });
    expect(tx.uploadRowStaging.updateMany).not.toHaveBeenCalled();
    expect(tx.validationError.createMany).not.toHaveBeenCalled();
  });

  it("marks the batch 'failed' and updates only the invalid row's status when a row has an error-severity issue", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        "uploadBatchId" in args.where
          ? [costRow("row-1", 1), costRow("row-2", 2, { cost_center_code: "CC-UNKNOWN" })]
          : []
      )
    );
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    expect(tx.uploadRowStaging.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["row-2"] } }, data: { status: "invalid" } });
    expect(tx.uploadBatch.update).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: { status: "failed", errorCount: 1 } });
    expect(tx.validationError.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ errorCode: "E_INVALID_COST_CENTER", rowNumber: 2 })]),
      })
    );
  });

  it("does not fail the batch for warning-only issues (e.g. W_ZERO_VALUE)", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve("uploadBatchId" in args.where ? [costRow("row-1", 1, { nominal: 0 })] : [])
    );
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    expect(tx.uploadBatch.update).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: { status: "validated", errorCount: 0 } });
    expect(tx.uploadRowStaging.updateMany).not.toHaveBeenCalled();
    expect(tx.validationError.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ errorCode: "W_ZERO_VALUE", severity: "warning" })] })
    );
  });

  it("flags a within-batch duplicate natural key with E_DUPLICATE_ROW on the later row", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve("uploadBatchId" in args.where ? [costRow("row-1", 1), costRow("row-2", 2)] : [])
    );
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    const call = (tx.validationError.createMany as jest.Mock).mock.calls[0][0];
    const duplicateEntries = call.data.filter((d: { errorCode: string }) => d.errorCode === "E_DUPLICATE_ROW");
    expect(duplicateEntries).toHaveLength(1);
    expect(duplicateEntries[0]).toMatchObject({ rowNumber: 2, severity: "warning" });
  });

  it("flags E_DUPLICATE_ROW against a prior promoted row for the same period from another batch", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockImplementation((args: { where: Record<string, unknown> }) => {
      if ("uploadBatchId" in args.where) return Promise.resolve([costRow("row-1", 1)]);
      const uploadBatchWhere = args.where.uploadBatch as { periodId: unknown };
      if (typeof uploadBatchWhere.periodId === "string") {
        // same-period confirmed-duplicates lookup
        return Promise.resolve([{ rawJson: { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1" } }]);
      }
      return Promise.resolve([]);
    });
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    const call = (tx.validationError.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data).toContainEqual(
      expect.objectContaining({ errorCode: "E_DUPLICATE_ROW", rowNumber: 1, severity: "warning" })
    );
  });

  it("skips the outlier check when fewer than 3 historical periods have data", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockImplementation((args: { where: Record<string, unknown> }) => {
      if ("uploadBatchId" in args.where) return Promise.resolve([costRow("row-1", 1, { nominal: 999_999_999 })]);
      const uploadBatchWhere = args.where.uploadBatch as { periodId: unknown };
      if (typeof uploadBatchWhere.periodId === "object") {
        // Only 2 distinct periods with data — below the 3-period minimum.
        return Promise.resolve([
          { rawJson: { nominal: 1000 }, uploadBatch: { periodId: "p-a" } },
          { rawJson: { nominal: 1100 }, uploadBatch: { periodId: "p-b" } },
        ]);
      }
      return Promise.resolve([]);
    });
    (prisma.period.findMany as jest.Mock).mockResolvedValue([{ id: "p-a" }, { id: "p-b" }]);
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    const call = (tx.validationError.createMany as jest.Mock).mock.calls[0]?.[0];
    expect(call?.data ?? []).not.toContainEqual(expect.objectContaining({ errorCode: "W_OUTLIER_NOMINAL" }));
  });

  it("flags W_OUTLIER_NOMINAL using the hospital's configured stddev multiplier once >=3 historical periods exist", async () => {
    const { prisma, tx, tenantContextService } = makeDeps();
    (prisma.hospitalSettings.findUnique as jest.Mock).mockResolvedValue({ outlierStddevMultiplier: 2 });
    (prisma.uploadRowStaging.findMany as jest.Mock).mockImplementation((args: { where: Record<string, unknown> }) => {
      if ("uploadBatchId" in args.where) return Promise.resolve([costRow("row-1", 1, { nominal: 100_000 })]);
      const uploadBatchWhere = args.where.uploadBatch as { periodId: unknown };
      if (typeof uploadBatchWhere.periodId === "object") {
        return Promise.resolve([
          { rawJson: { nominal: 1000 }, uploadBatch: { periodId: "p-a" } },
          { rawJson: { nominal: 1100 }, uploadBatch: { periodId: "p-b" } },
          { rawJson: { nominal: 900 }, uploadBatch: { periodId: "p-c" } },
        ]);
      }
      return Promise.resolve([]);
    });
    (prisma.period.findMany as jest.Mock).mockResolvedValue([{ id: "p-a" }, { id: "p-b" }, { id: "p-c" }]);
    const service = new ValidateService(prisma, tenantContextService);

    await service.processValidate(payload);

    const call = (tx.validationError.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data).toContainEqual(expect.objectContaining({ errorCode: "W_OUTLIER_NOMINAL", severity: "warning" }));
  });
});
