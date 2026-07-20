import { AllocationEngineService } from "./allocation-engine.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AllocationQueueService } from "../queue/allocation-queue.service";

const payload = { allocationRunId: "run-1", hospitalId: "hospital-1", organizationId: "org-1", actorUserId: "actor-1" };

const draftRun = {
  id: "run-1",
  hospitalId: "hospital-1",
  periodId: "period-1",
  method: "direct",
  status: "draft",
  period: { id: "period-1", label: "2026-01", status: "open" },
};

function makeDeps() {
  const tx = {
    $executeRaw: jest.fn(),
    allocatedCost: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    allocationRun: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    allocationRun: { findFirst: jest.fn().mockResolvedValue(draftRun), update: jest.fn().mockResolvedValue({}) },
    allocationRule: { findMany: jest.fn().mockResolvedValue([]) },
    costEntry: { groupBy: jest.fn().mockResolvedValue([]) },
    profitCenter: { findMany: jest.fn().mockResolvedValue([]) },
    driverValue: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;

  const allocationQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as AllocationQueueService;

  return { prisma, tx, tenantContextService: new TenantContextService(), allocationQueueService };
}

describe("AllocationEngineService.processRun", () => {
  it("is a no-op when the run is not in 'draft' status", async () => {
    const { prisma, tx, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({ ...draftRun, status: "completed" });
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await service.processRun(payload);

    expect(prisma.allocationRule.findMany).not.toHaveBeenCalled();
    expect(tx.allocationRun.update).not.toHaveBeenCalled();
  });

  it("is a no-op when the run doesn't exist for this hospital", async () => {
    const { prisma, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await expect(service.processRun(payload)).resolves.toBeUndefined();
    expect(prisma.allocationRule.findMany).not.toHaveBeenCalled();
  });

  it("fails the run when the period is not open", async () => {
    const { prisma, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({
      ...draftRun,
      period: { ...draftRun.period, status: "locked" },
    });
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await service.processRun(payload);

    expect(prisma.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining("not open") }),
    });
    expect(prisma.allocationRule.findMany).not.toHaveBeenCalled();
    expect(allocationQueueService.enqueue).not.toHaveBeenCalled();
  });

  it("fails the run when no allocation rules are configured for this method/period", async () => {
    const { prisma, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRule.findMany as jest.Mock).mockResolvedValue([]);
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await service.processRun(payload);

    expect(prisma.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining("No allocation rules") }),
    });
  });

  it("fails the run with a clear message when allocation_rules.priority has a duplicate (CycleDetectedError)", async () => {
    const { prisma, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({ ...draftRun, method: "step_down" });
    (prisma.allocationRule.findMany as jest.Mock).mockResolvedValue([
      { costCenterId: "HRD", driverId: "EMP", priority: 1 },
      { costCenterId: "IT", driverId: "DEVICE", priority: 1 },
    ]);
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await service.processRun(payload);

    expect(prisma.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining("Duplicate allocation priority") }),
    });
  });

  /**
   * MANUAL CALCULATION (same fixture as packages/domain's Laundry example):
   * Laundry direct cost 10,000,000, driven by kg-laundry to PC-RJ (700kg)
   * and PC-RI (300kg): RJ = 10,000,000 * 700/1000 = 7,000,000,
   * RI = 10,000,000 * 300/1000 = 3,000,000.
   */
  it("runs Direct allocation end-to-end against mocked Prisma data and persists the exact hand-computed amounts", async () => {
    const { prisma, tx, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRule.findMany as jest.Mock).mockResolvedValue([
      { costCenterId: "LAUNDRY", driverId: "KG_LAUNDRY", priority: 1 },
    ]);
    (prisma.costEntry.groupBy as jest.Mock).mockResolvedValue([{ costCenterId: "LAUNDRY", _sum: { nominal: 10_000_000 } }]);
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-RJ" }, { id: "PC-RI" }]);
    (prisma.driverValue.findMany as jest.Mock).mockResolvedValue([
      { driverId: "KG_LAUNDRY", targetCostCenterId: null, targetProfitCenterId: "PC-RJ", value: 700 },
      { driverId: "KG_LAUNDRY", targetCostCenterId: null, targetProfitCenterId: "PC-RI", value: 300 },
    ]);
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await service.processRun(payload);

    expect(prisma.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "running", startedAt: expect.any(Date) },
    });

    const createManyCall = (tx.allocatedCost.createMany as jest.Mock).mock.calls[0][0];
    const amounts = Object.fromEntries(
      createManyCall.data.map((row: { targetProfitCenterId: string; amount: string }) => [row.targetProfitCenterId, row.amount])
    );
    expect(amounts["PC-RJ"]).toBe("7000000.00");
    expect(amounts["PC-RI"]).toBe("3000000.00");

    expect(tx.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "completed", finishedAt: expect.any(Date) },
    });
    expect(allocationQueueService.enqueue).toHaveBeenCalledWith("profitability.compute", {
      allocationRunId: "run-1",
      hospitalId: "hospital-1",
      organizationId: "org-1",
      actorUserId: "actor-1",
    });
  });

  /**
   * MANUAL CALCULATION — docs/08_COST_ALLOCATION_ENGINE.md §4 reference
   * fixture: HRD (priority 1, direct 100,000,000, Employee Count driver
   * 40%/40%/20% to RJ/RI/IT) then IT (priority 2, direct 50,000,000 +
   * 20,000,000 received = pool 70,000,000, Device Count driver 60%/40% to
   * RJ/RI). RJ total = 40,000,000 + 42,000,000 = 82,000,000. RI total =
   * 40,000,000 + 28,000,000 = 68,000,000.
   */
  it("runs Step-Down allocation end-to-end and persists the exact docs §4 worked-example amounts", async () => {
    const { prisma, tx, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({ ...draftRun, method: "step_down" });
    (prisma.allocationRule.findMany as jest.Mock).mockResolvedValue([
      { costCenterId: "HRD", driverId: "EMP_COUNT", priority: 1 },
      { costCenterId: "IT", driverId: "DEVICE_COUNT", priority: 2 },
    ]);
    (prisma.costEntry.groupBy as jest.Mock).mockResolvedValue([
      { costCenterId: "HRD", _sum: { nominal: 100_000_000 } },
      { costCenterId: "IT", _sum: { nominal: 50_000_000 } },
    ]);
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "RJ" }, { id: "RI" }]);
    (prisma.driverValue.findMany as jest.Mock).mockResolvedValue([
      { driverId: "EMP_COUNT", targetCostCenterId: null, targetProfitCenterId: "RJ", value: 40 },
      { driverId: "EMP_COUNT", targetCostCenterId: null, targetProfitCenterId: "RI", value: 40 },
      { driverId: "EMP_COUNT", targetCostCenterId: "IT", targetProfitCenterId: null, value: 20 },
      { driverId: "DEVICE_COUNT", targetCostCenterId: null, targetProfitCenterId: "RJ", value: 60 },
      { driverId: "DEVICE_COUNT", targetCostCenterId: null, targetProfitCenterId: "RI", value: 40 },
    ]);
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await service.processRun(payload);

    const createManyCall = (tx.allocatedCost.createMany as jest.Mock).mock.calls[0][0];
    const totalByProfitCenter: Record<string, number> = {};
    for (const row of createManyCall.data as { targetProfitCenterId: string | null; amount: string }[]) {
      if (!row.targetProfitCenterId) continue;
      totalByProfitCenter[row.targetProfitCenterId] = (totalByProfitCenter[row.targetProfitCenterId] ?? 0) + Number(row.amount);
    }
    expect(totalByProfitCenter["RJ"]).toBe(82_000_000);
    expect(totalByProfitCenter["RI"]).toBe(68_000_000);

    expect(tx.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "completed", finishedAt: expect.any(Date) },
    });
    expect(allocationQueueService.enqueue).toHaveBeenCalledWith("profitability.compute", expect.objectContaining({ allocationRunId: "run-1" }));
  });

  it("persists W_DRIVER_ZERO warnings on the run when a driver has zero total value", async () => {
    const { prisma, tx, tenantContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRule.findMany as jest.Mock).mockResolvedValue([
      { costCenterId: "KITCHEN", driverId: "MEAL_COUNT", priority: 1 },
    ]);
    (prisma.costEntry.groupBy as jest.Mock).mockResolvedValue([{ costCenterId: "KITCHEN", _sum: { nominal: 10_000_000 } }]);
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-A" }, { id: "PC-B" }]);
    (prisma.driverValue.findMany as jest.Mock).mockResolvedValue([]);
    const service = new AllocationEngineService(prisma, tenantContextService, allocationQueueService);

    await service.processRun(payload);

    expect(tx.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "completed",
        finishedAt: expect.any(Date),
        warnings: [{ code: "W_DRIVER_ZERO", costCenterId: "KITCHEN", driverId: "MEAL_COUNT" }],
      },
    });
  });
});
