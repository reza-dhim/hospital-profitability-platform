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
    asset: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    employee: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    bmhpItem: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    tariff: {
      create: jest.fn().mockResolvedValue({ id: "new-tariff-id", currentTariff: 150000 }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    service: { update: jest.fn().mockResolvedValue({}) },
    medicalActivity: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
    vendor: { findMany: jest.fn().mockResolvedValue([]) },
    doctor: { findMany: jest.fn().mockResolvedValue([]) },
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

  it("promotes asset rows into Asset (insert-only), tagged with sourceFileId, with an optional cost_center_code resolved", async () => {
    const { prisma, tx, tenantContextService, auditContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, type: "asset" });
    (prisma.costCenter.findMany as jest.Mock).mockResolvedValue([{ id: "cc-id-1", code: "CC-1" }]);
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      {
        id: "row-1",
        rowNumber: 1,
        rawJson: {
          code: "AST-001",
          name: "USG Machine",
          category: "medical-equipment",
          cost_center_code: "CC-1",
          acquisition_cost: 250000000,
          depreciation_method: "straight-line",
          useful_life_months: 60,
        },
      },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.asset.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        code: "AST-001",
        name: "USG Machine",
        category: "medical-equipment",
        costCenterId: "cc-id-1",
        acquisitionCost: 250000000,
        depreciationMethod: "straight-line",
        usefulLifeMonths: 60,
        sourceFileId: "batch-1",
        createdByUserId: "actor-1",
        updatedByUserId: "actor-1",
      },
    });
  });

  it("promotes employee rows into Employee with a null departmentCostCenterId when the column is blank", async () => {
    const { prisma, tx, tenantContextService, auditContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, type: "employee" });
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      {
        id: "row-1",
        rowNumber: 1,
        rawJson: {
          code: "EMP-001",
          name: "Siti Rahma",
          role_title: null,
          department_cost_center_code: null,
          employment_type: "permanent",
        },
      },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.employee.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        code: "EMP-001",
        name: "Siti Rahma",
        roleTitle: null,
        departmentCostCenterId: null,
        employmentType: "permanent",
        sourceFileId: "batch-1",
        createdByUserId: "actor-1",
        updatedByUserId: "actor-1",
      },
    });
  });

  it("promotes bmhp rows into BmhpItem, resolving vendor_code", async () => {
    const { prisma, tx, tenantContextService, auditContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, type: "bmhp" });
    (prisma.vendor.findMany as jest.Mock).mockResolvedValue([{ id: "vnd-id-1", code: "VND-1" }]);
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      {
        id: "row-1",
        rowNumber: 1,
        rawJson: { code: "BMHP-001", name: "Sarung Tangan Steril", unit: "box", standard_cost: 45000, vendor_code: "VND-1" },
      },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.bmhpItem.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        code: "BMHP-001",
        name: "Sarung Tangan Steril",
        unit: "box",
        standardCost: 45000,
        vendorId: "vnd-id-1",
        sourceFileId: "batch-1",
        createdByUserId: "actor-1",
        updatedByUserId: "actor-1",
      },
    });
  });

  it("promotes tariff rows via supersede-on-create (mirrors TariffService.create), syncing Service.currentTariff", async () => {
    const { prisma, tx, tenantContextService, auditContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, type: "tariff" });
    (prisma.service.findMany as jest.Mock).mockResolvedValue([{ id: "svc-id-1", code: "SVC-1" }]);
    (tx.tariff.findFirst as jest.Mock).mockResolvedValue({ id: "old-tariff-id" });
    (tx.tariff.create as jest.Mock).mockResolvedValue({ id: "new-tariff-id", currentTariff: 175000 });
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      {
        id: "row-1",
        rowNumber: 1,
        rawJson: {
          service_code: "SVC-1",
          current_tariff: 175000,
          recommended_tariff: 200000,
          effective_date: "2026-08-01",
        },
      },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.tariff.updateMany).toHaveBeenCalledWith({
      where: { id: "old-tariff-id" },
      data: { status: "superseded", updatedByUserId: "actor-1" },
    });
    expect(tx.tariff.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        serviceId: "svc-id-1",
        currentTariff: 175000,
        recommendedTariff: 200000,
        effectiveDate: new Date("2026-08-01"),
        approvedByUserId: "actor-1",
        approvedAt: expect.any(Date),
        status: "active",
        sourceFileId: "batch-1",
        supersedesTariffId: "old-tariff-id",
        createdByUserId: "actor-1",
        updatedByUserId: "actor-1",
      },
    });
    expect(tx.service.update).toHaveBeenCalledWith({
      where: { id: "svc-id-1" },
      data: { currentTariff: 175000 },
    });
  });

  it("promotes medical_activity rows into MedicalActivity, resolving service_code and doctor_code", async () => {
    const { prisma, tx, tenantContextService, auditContextService } = makeDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...validatedCostBatch, type: "medical_activity" });
    (prisma.service.findMany as jest.Mock).mockResolvedValue([{ id: "svc-id-1", code: "SVC-1" }]);
    (prisma.doctor.findMany as jest.Mock).mockResolvedValue([{ id: "doc-id-1", code: "DOC-1" }]);
    (prisma.uploadRowStaging.findMany as jest.Mock).mockResolvedValue([
      {
        id: "row-1",
        rowNumber: 1,
        rawJson: {
          period: "2026-01",
          service_code: "SVC-1",
          doctor_code: "DOC-1",
          volume: 3,
          duration_minutes: 45,
          bmhp_cost: 250000,
          room_cost: 500000,
          staff_cost: 150000,
          revenue: 1500000,
        },
      },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.confirm("hospital-1", "batch-1", {}, "actor-1");

    expect(tx.medicalActivity.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        periodId: "period-1",
        serviceId: "svc-id-1",
        doctorId: "doc-id-1",
        volume: 3,
        durationMinutes: 45,
        bmhpCost: 250000,
        roomCost: 500000,
        staffCost: 150000,
        revenue: 1500000,
        sourceFileId: "batch-1",
      },
    });
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

  it("hard-deletes MedicalActivity rows scoped by sourceFileId (period-scoped case-level data, not soft-delete)", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "medical_activity" });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.rollback("hospital-1", "batch-1", "actor-1");

    expect(tx.medicalActivity.deleteMany).toHaveBeenCalledWith({ where: { sourceFileId: "batch-1" } });
  });

  it("soft-deletes Asset rows scoped by sourceFileId (not a hard delete, matching Master Data CRUD)", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "asset" });
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.rollback("hospital-1", "batch-1", "actor-1");

    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { sourceFileId: "batch-1", deletedAt: null },
      data: { deletedAt: expect.any(Date), updatedByUserId: "actor-1" },
    });
  });

  it("rejects tariff rollback when a row this batch created has since been superseded by a change outside this batch", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "tariff" });
    (tx.tariff.findMany as jest.Mock).mockResolvedValue([
      { id: "t-1", serviceId: "svc-1", status: "superseded", supersedesTariffId: "prior-1", createdAt: new Date("2026-01-01") },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    const error = await service.rollback("hospital-1", "batch-1", "actor-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: "UPLOAD_ROLLBACK_NOT_SUPPORTED" });
    expect(tx.tariff.update).not.toHaveBeenCalled();
  });

  it("restores the prior active tariff + Service.currentTariff on a clean tariff rollback, unwinding newest-first", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "tariff" });
    (tx.tariff.findMany as jest.Mock).mockResolvedValue([
      { id: "t-1", serviceId: "svc-1", status: "active", supersedesTariffId: "prior-1", createdAt: new Date("2026-01-01") },
    ]);
    (tx.tariff.update as jest.Mock).mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === "prior-1" ? Promise.resolve({ id: "prior-1", currentTariff: 150000 }) : Promise.resolve({})
    );
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.rollback("hospital-1", "batch-1", "actor-1");

    expect(tx.tariff.update).toHaveBeenCalledWith({
      where: { id: "t-1" },
      data: { deletedAt: expect.any(Date), status: "superseded", updatedByUserId: "actor-1" },
    });
    expect(tx.tariff.update).toHaveBeenCalledWith({
      where: { id: "prior-1" },
      data: { status: "active", updatedByUserId: "actor-1" },
    });
    expect(tx.service.update).toHaveBeenCalledWith({
      where: { id: "svc-1" },
      data: { currentTariff: 150000 },
    });
  });

  it("nulls out Service.currentTariff on tariff rollback when the batch's row was the first tariff ever set (no supersedesTariffId)", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "tariff" });
    (tx.tariff.findMany as jest.Mock).mockResolvedValue([
      { id: "t-1", serviceId: "svc-1", status: "active", supersedesTariffId: null, createdAt: new Date("2026-01-01") },
    ]);
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await service.rollback("hospital-1", "batch-1", "actor-1");

    expect(tx.service.update).toHaveBeenCalledWith({
      where: { id: "svc-1" },
      data: { currentTariff: null },
    });
  });

  it("allows tariff rollback when a batch row was superseded by ANOTHER row from the same batch (in-batch chain)", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeRollbackDeps();
    (prisma.uploadBatch.findFirst as jest.Mock).mockResolvedValue({ ...confirmedCostBatch, type: "tariff" });
    (tx.tariff.findMany as jest.Mock).mockResolvedValue([
      { id: "t-1", serviceId: "svc-1", status: "superseded", supersedesTariffId: "prior-1", createdAt: new Date("2026-01-01") },
      { id: "t-2", serviceId: "svc-1", status: "active", supersedesTariffId: "t-1", createdAt: new Date("2026-01-02") },
    ]);
    (tx.tariff.update as jest.Mock).mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, currentTariff: 100000 })
    );
    const service = new ConfirmService(prisma, tenantContextService, auditContextService);

    await expect(service.rollback("hospital-1", "batch-1", "actor-1")).resolves.toBeDefined();
    // Newest-first: t-2 undone first (restoring t-1 to active), then t-1 undone (restoring prior-1).
    expect(tx.tariff.update).toHaveBeenCalledWith({
      where: { id: "t-2" },
      data: { deletedAt: expect.any(Date), status: "superseded", updatedByUserId: "actor-1" },
    });
    expect(tx.tariff.update).toHaveBeenCalledWith({ where: { id: "t-1" }, data: { status: "active", updatedByUserId: "actor-1" } });
    expect(tx.tariff.update).toHaveBeenCalledWith({
      where: { id: "t-1" },
      data: { deletedAt: expect.any(Date), status: "superseded", updatedByUserId: "actor-1" },
    });
    expect(tx.tariff.update).toHaveBeenCalledWith({ where: { id: "prior-1" }, data: { status: "active", updatedByUserId: "actor-1" } });
  });
});
