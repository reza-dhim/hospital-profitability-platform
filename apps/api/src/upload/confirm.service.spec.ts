import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { ConfirmService } from "./confirm.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TenantContextService } from "../tenancy/tenant-context.service";
import type { AuditContextService } from "../audit/audit-context.service";

const validatedCostBatch = {
  id: "batch-1",
  hospitalId: "hospital-1",
  type: "cost",
  periodId: "period-1",
  status: "validated",
  period: { id: "period-1", label: "2026-01", status: "open" },
};

const confirmedCostBatch = { ...validatedCostBatch, status: "confirmed" };

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
    costEntry: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    revenueEntry: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    driverValue: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    uploadRowStaging: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    uploadBatch: { update: jest.fn().mockResolvedValue({}) },
    allocationRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

  const prisma = {
    uploadBatch: {
      findFirst: jest.fn().mockResolvedValue(validatedCostBatch),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "batch-1", status: "confirmed" }),
    },
    validationError: { count: jest.fn().mockResolvedValue(0) },
    uploadRowStaging: { findMany: jest.fn().mockResolvedValue([costRow("row-1", 1)]) },
    costCenter: { findMany: jest.fn().mockResolvedValue([{ id: "cc-id-1", code: "CC-1" }]) },
    coaAccount: { findMany: jest.fn().mockResolvedValue([{ id: "coa-id-1", code: "COA-1" }]) },
    profitCenter: { findMany: jest.fn().mockResolvedValue([]) },
    service: { findMany: jest.fn().mockResolvedValue([]) },
    driver: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;

  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  const tenantContextService = {
    get: jest.fn().mockReturnValue({ organizationId: "org-1", hospitalId: "hospital-1", userId: "actor-1" }),
    isAuthBypass: jest.fn().mockReturnValue(false),
    isOrgBootstrap: jest.fn().mockReturnValue(false),
    setManagedTransaction: jest.fn(),
  } as unknown as TenantContextService;

  return { prisma, tx, auditContextService, tenantContextService };
}

describe("ConfirmService.confirm", () => {
  it("rejects a batch that is not 'validated'", async () => {
    const { prisma, auditContextService, tenantContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, status: "staged" });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await expect(service.confirm("hospital-1", "batch-1", {}, "actor-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects when the target period is not open", async () => {
    const { prisma, auditContextService, tenantContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({
      ...validatedCostBatch,
      period: { ...validatedCostBatch.period, status: "locked" },
    });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    const error = await service.confirm("hospital-1", "batch-1", {}, "actor-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: "PERIOD_NOT_OPEN" });
  });

  it("rejects when warnings exist and were not acknowledged", async () => {
    const { prisma, auditContextService, tenantContextService } = makeDeps();
    (prisma.validationError.count as jest.Mock).mockResolvedValue(1);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    const error = await service.confirm("hospital-1", "batch-1", {}, "actor-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: "UPLOAD_WARNINGS_NOT_ACKNOWLEDGED",
    });
  });

  it("proceeds when warnings exist and acknowledged: true is passed", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeDeps();
    (prisma.validationError.count as jest.Mock).mockResolvedValue(1);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", { acknowledged: true }, "actor-1");

    expect(tx.costEntry.create).toHaveBeenCalled();
  });

  it("promotes cost rows into CostEntry, marks rows promoted, confirms the batch, and records the audit entry", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([costRow("row-1", 1), costRow("row-2", 2)]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.costEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.costEntry.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        periodId: "period-1",
        costCenterId: "cc-id-1",
        coaAccountId: "coa-id-1",
        nominal: 1000,
        sourceFileId: "batch-1",
      },
    });
    expect(tx.uploadRowStaging.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["row-1", "row-2"] } },
      data: { status: "promoted" },
    });
    expect(tx.uploadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { status: "confirmed", confirmedAt: expect.any(Date) },
    });
    expect(auditContextService.record).toHaveBeenCalledWith({
      entity: "upload",
      action: "upload.confirm",
      entityId: "batch-1",
      userId: "actor-1",
      before: { status: "validated" },
      after: { status: "confirmed", promotedRowCount: 2 },
    });
  });

  it("promotes revenue rows into RevenueEntry when the batch type is revenue", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, type: "revenue" });
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "pc-id-1", code: "PC-1" }]);
    (prisma.service.findMany as jest.Mock).mockResolvedValue([{ id: "svc-id-1", code: "SVC-1" }]);
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      {
        id: "row-1",
        rowNumber: 1,
        rawJson: { period: "2026-01", profit_center_code: "PC-1", service_code: "SVC-1", volume: 10, revenue: 5000 },
      },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.revenueEntry.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        periodId: "period-1",
        profitCenterId: "pc-id-1",
        serviceId: "svc-id-1",
        volume: 10,
        revenue: 5000,
        sourceFileId: "batch-1",
      },
    });
    expect(tx.costEntry.create).not.toHaveBeenCalled();
  });

  it("promotes driver rows into DriverValue, resolving target_cost_center_id or target_profit_center_id by target_type", async () => {
    const { prisma, tx, tenantContextService, auditContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, type: "driver" });
    (prisma.driver.findMany as jest.Mock).mockResolvedValue([{ id: "drv-id-1", code: "DRV-1" }]);
    (prisma.costCenter.findMany as jest.Mock).mockResolvedValue([{ id: "cc-id-1", code: "CC-1" }]);
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "pc-id-1", code: "PC-1" }]);
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      {
        id: "row-1",
        rowNumber: 1,
        rawJson: { period: "2026-01", driver_code: "DRV-1", target_type: "cost_center", target_code: "CC-1", value: 700 },
      },
      {
        id: "row-2",
        rowNumber: 2,
        rawJson: { period: "2026-01", driver_code: "DRV-1", target_type: "profit_center", target_code: "PC-1", value: 300 },
      },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.driverValue.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        periodId: "period-1",
        driverId: "drv-id-1",
        targetCostCenterId: "cc-id-1",
        targetProfitCenterId: null,
        value: 700,
        sourceFileId: "batch-1",
      },
    });
    expect(tx.driverValue.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        periodId: "period-1",
        driverId: "drv-id-1",
        targetCostCenterId: null,
        targetProfitCenterId: "pc-id-1",
        value: 300,
        sourceFileId: "batch-1",
      },
    });
    expect(tx.costEntry.create).not.toHaveBeenCalled();
  });

  it("fails the whole confirm (mid-transaction) when a row's referenced master data no longer resolves", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeDeps();
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      costRow("row-1", 1),
      costRow("row-2", 2, { cost_center_code: "CC-DELETED" }),
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    const error = await service.confirm("hospital-1", "batch-1", {}, "actor-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: "UPLOAD_PROMOTION_REFERENCE_MISSING",
    });
    // Row 1 was created before row 2 failed — proves the failure happens
    // mid-transaction, not as an upfront pre-check (real Postgres rollback,
    // undoing row 1's insert too, is proven in the integration suite; a
    // mocked `$transaction` here can't demonstrate that part).
    expect(tx.costEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.uploadBatch.update).not.toHaveBeenCalled();
    expect(auditContextService.record).not.toHaveBeenCalled();
  });
});

describe("ConfirmService.rollback", () => {
  function makeRollbackDeps() {
    const deps = makeDeps();
    (deps.prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue(confirmedCostBatch);
    return deps;
  }

  it("rejects a batch that is not 'confirmed'", async () => {
    const { prisma, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, status: "staged" });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await expect(service.rollback("hospital-1", "batch-1", "actor-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects when the period is not open", async () => {
    const { prisma, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({
      ...confirmedCostBatch,
      period: { ...confirmedCostBatch.period, status: "locked" },
    });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    const error = await service.rollback("hospital-1", "batch-1", "actor-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: "PERIOD_NOT_OPEN" });
  });

  it("deletes CostEntry rows scoped by sourceFileId, reverts promoted rows to valid, and marks the batch rolled_back", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.rollback("hospital-1", "batch-1", "actor-1");

    expect(tx.costEntry.deleteMany).toHaveBeenCalledWith({ where: { sourceFileId: "batch-1" } });
    expect(tx.revenueEntry.deleteMany).not.toHaveBeenCalled();
    expect(tx.uploadRowStaging.updateMany).toHaveBeenCalledWith({
      where: { uploadBatchId: "batch-1", status: "promoted" },
      data: { status: "valid" },
    });
    expect(tx.uploadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { status: "rolled_back", rolledBackAt: expect.any(Date) },
    });
    expect(tx.allocationRun.updateMany).toHaveBeenCalledWith({
      where: { periodId: "period-1", isStale: false },
      data: { isStale: true, staleAt: expect.any(Date) },
    });
    expect(auditContextService.record).toHaveBeenCalledWith({
      entity: "upload",
      action: "upload.rollback",
      entityId: "batch-1",
      userId: "actor-1",
      before: { status: "confirmed" },
      after: { status: "rolled_back" },
    });
  });

  it("deletes RevenueEntry rows when the batch type is revenue", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "revenue" });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.rollback("hospital-1", "batch-1", "actor-1");

    expect(tx.revenueEntry.deleteMany).toHaveBeenCalledWith({ where: { sourceFileId: "batch-1" } });
    expect(tx.costEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes DriverValue rows when the batch type is driver", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "driver" });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.rollback("hospital-1", "batch-1", "actor-1");

    expect(tx.driverValue.deleteMany).toHaveBeenCalledWith({ where: { sourceFileId: "batch-1" } });
    expect(tx.costEntry.deleteMany).not.toHaveBeenCalled();
    expect(tx.revenueEntry.deleteMany).not.toHaveBeenCalled();
  });
});
