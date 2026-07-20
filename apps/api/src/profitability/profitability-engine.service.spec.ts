import { ProfitabilityEngineService } from "./profitability-engine.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TargetMarginService } from "../target-margin/target-margin.service";
import { Decimal } from "@hpp/domain";

const payload = { allocationRunId: "run-1", hospitalId: "hospital-1", organizationId: "org-1", actorUserId: "actor-1" };

const completedRun = { id: "run-1", hospitalId: "hospital-1", periodId: "period-1", status: "completed" };

function makeDeps() {
  const tx = {
    $executeRaw: jest.fn(),
    profitabilityResult: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    serviceUnitCost: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

  // revenueEntry.groupBy is called twice per run with different `by`
  // shapes — once grouped by profitCenterId (profitability), once by
  // serviceId (unit cost apportionment). Distinguish by inspecting `by`.
  const revenueEntryGroupBy = jest.fn((args: { by: string[] }) => {
    if (args.by[0] === "serviceId") return Promise.resolve([]);
    return Promise.resolve([]);
  });

  const prisma = {
    allocationRun: { findFirst: jest.fn().mockResolvedValue(completedRun), update: jest.fn().mockResolvedValue({}) },
    profitabilityResult: { count: jest.fn().mockResolvedValue(0) },
    profitCenter: { findMany: jest.fn().mockResolvedValue([]) },
    revenueEntry: { groupBy: revenueEntryGroupBy },
    costCenter: { findMany: jest.fn().mockResolvedValue([]) },
    costEntry: { groupBy: jest.fn().mockResolvedValue([]) },
    allocatedCost: { groupBy: jest.fn().mockResolvedValue([]) },
    service: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;

  const targetMarginService = {
    resolveForService: jest.fn().mockResolvedValue(new Decimal(15)),
  } as unknown as TargetMarginService;

  return { prisma, tx, tenantContextService: new TenantContextService(), targetMarginService };
}

describe("ProfitabilityEngineService.processRun", () => {
  it("is a no-op when the run is not in 'completed' status", async () => {
    const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({ ...completedRun, status: "running" });
    const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

    await service.processRun(payload);

    expect(prisma.profitCenter.findMany).not.toHaveBeenCalled();
    expect(tx.profitabilityResult.createMany).not.toHaveBeenCalled();
  });

  it("is a no-op when the run doesn't exist for this hospital", async () => {
    const { prisma, tenantContextService, targetMarginService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

    await expect(service.processRun(payload)).resolves.toBeUndefined();
  });

  it("is a no-op when profitability_results already exist for this run (idempotency)", async () => {
    const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
    (prisma.profitabilityResult.count as jest.Mock).mockResolvedValue(2);
    const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

    await service.processRun(payload);

    expect(prisma.profitCenter.findMany).not.toHaveBeenCalled();
    expect(tx.profitabilityResult.createMany).not.toHaveBeenCalled();
  });

  /**
   * MANUAL CALCULATION (the user's own Sprint 6 planning example): Rawat
   * Inap has revenue 22,500,000, no direct-type cost centers (direct_cost =
   * 0), and allocated_cost 14,100,000 from this run.
   *   total_cost   = 0 + 14,100,000 = 14,100,000
   *   gross_profit = 22,500,000 - 0 - 14,100,000 = 8,400,000
   *   margin       = 8,400,000 / 22,500,000 * 100 = 37.3333...% ≈ 37.3%
   */
  it("matches the Rawat Inap worked example exactly: gross_profit=8,400,000, margin≈37.3%", async () => {
    const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-RI" }]);
    (prisma.revenueEntry.groupBy as jest.Mock).mockImplementation((args: { by: string[] }) =>
      args.by[0] === "profitCenterId"
        ? Promise.resolve([{ profitCenterId: "PC-RI", _sum: { revenue: 22_500_000 } }])
        : Promise.resolve([])
    );
    (prisma.allocatedCost.groupBy as jest.Mock).mockResolvedValue([{ targetProfitCenterId: "PC-RI", _sum: { amount: 14_100_000 } }]);
    const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

    await service.processRun(payload);

    const call = (tx.profitabilityResult.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data).toEqual([
      {
        allocationRunId: "run-1",
        profitCenterId: "PC-RI",
        revenue: "22500000.00",
        directCost: "0.00",
        allocatedCost: "14100000.00",
        totalCost: "14100000.00",
        grossProfit: "8400000.00",
        margin: "37.3333",
      },
    ]);
  });

  /**
   * MANUAL CALCULATION: profit center PC-LAB has a direct-type cost center
   * (Reagents, direct cost 2,000,000, linked via CostCenter.profitCenterId)
   * plus revenue 10,000,000 and allocated_cost 3,000,000.
   *   total_cost   = 2,000,000 + 3,000,000 = 5,000,000
   *   gross_profit = 10,000,000 - 2,000,000 - 3,000,000 = 5,000,000
   *   margin       = 5,000,000 / 10,000,000 * 100 = 50%
   */
  it("attributes a direct-type cost center's cost_entries to its linked profit center via CostCenter.profitCenterId", async () => {
    const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-LAB" }]);
    (prisma.revenueEntry.groupBy as jest.Mock).mockImplementation((args: { by: string[] }) =>
      args.by[0] === "profitCenterId"
        ? Promise.resolve([{ profitCenterId: "PC-LAB", _sum: { revenue: 10_000_000 } }])
        : Promise.resolve([])
    );
    (prisma.costCenter.findMany as jest.Mock).mockResolvedValue([{ id: "CC-REAGENT", profitCenterId: "PC-LAB" }]);
    (prisma.costEntry.groupBy as jest.Mock).mockResolvedValue([{ costCenterId: "CC-REAGENT", _sum: { nominal: 2_000_000 } }]);
    (prisma.allocatedCost.groupBy as jest.Mock).mockResolvedValue([{ targetProfitCenterId: "PC-LAB", _sum: { amount: 3_000_000 } }]);
    const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

    await service.processRun(payload);

    const call = (tx.profitabilityResult.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data).toEqual([
      expect.objectContaining({
        profitCenterId: "PC-LAB",
        directCost: "2000000.00",
        totalCost: "5000000.00",
        grossProfit: "5000000.00",
        margin: "50.0000",
      }),
    ]);
  });

  it("writes margin = null when revenue is zero, and still writes zero-value rows for profit centers with no data at all", async () => {
    const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
    (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-EMPTY" }]);
    const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

    await service.processRun(payload);

    const call = (tx.profitabilityResult.createMany as jest.Mock).mock.calls[0][0];
    expect(call.data).toEqual([
      {
        allocationRunId: "run-1",
        profitCenterId: "PC-EMPTY",
        revenue: "0.00",
        directCost: "0.00",
        allocatedCost: "0.00",
        totalCost: "0.00",
        grossProfit: "0.00",
        margin: null,
      },
    ]);
  });

  it("marks the run completed_with_errors and stores the error message when computation throws", async () => {
    const { prisma, tenantContextService, targetMarginService } = makeDeps();
    (prisma.profitCenter.findMany as jest.Mock).mockRejectedValue(new Error("db exploded"));
    const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

    await service.processRun(payload);

    expect(prisma.allocationRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "completed_with_errors", errorMessage: "db exploded" },
    });
  });

  describe("service_unit_costs (docs/10_UNIT_COST_ENGINE.md)", () => {
    /**
     * MANUAL CALCULATION: profit center PC-RJ has allocated_cost 8,200,000
     * this run, and two services:
     *   SVC-A: revenue 700,000, volume 100
     *   SVC-B: revenue 300,000, volume 50
     * Total PC-RJ revenue = 1,000,000 (revenue-weighted apportionment,
     * docs/10 §3).
     *   SVC-A share = 700,000/1,000,000 = 0.7 -> allocated = 8,200,000*0.7 = 5,740,000
     *   SVC-B share = 300,000/1,000,000 = 0.3 -> allocated = 8,200,000*0.3 = 2,460,000
     * service_direct_cost = 0 for both (medical_activities deferred).
     *   SVC-A unit_cost = 5,740,000/100 = 57,400
     *   SVC-B unit_cost = 2,460,000/50  = 49,200
     * Target margin resolved = 20% (0.20) for both.
     *   SVC-A current_tariff 60,000 -> tariff_gap = 60,000-57,400 = 2,600
     *     recommended_tariff = 57,400/(1-0.20) = 57,400/0.8 = 71,750
     *   SVC-B current_tariff 55,000 -> tariff_gap = 55,000-49,200 = 5,800
     *     recommended_tariff = 49,200/0.8 = 61,500
     */
    it("apportions allocated_cost by revenue-weighted share and matches the hand-computed unit economics exactly", async () => {
      const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
      (targetMarginService.resolveForService as jest.Mock).mockResolvedValue(new Decimal(20));
      (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-RJ" }]);
      (prisma.allocatedCost.groupBy as jest.Mock).mockResolvedValue([{ targetProfitCenterId: "PC-RJ", _sum: { amount: 8_200_000 } }]);
      (prisma.revenueEntry.groupBy as jest.Mock).mockImplementation((args: { by: string[] }) =>
        args.by[0] === "profitCenterId"
          ? Promise.resolve([{ profitCenterId: "PC-RJ", _sum: { revenue: 1_000_000 } }])
          : Promise.resolve([
              { serviceId: "SVC-A", _sum: { revenue: 700_000, volume: 100 } },
              { serviceId: "SVC-B", _sum: { revenue: 300_000, volume: 50 } },
            ])
      );
      (prisma.service.findMany as jest.Mock).mockResolvedValue([
        { id: "SVC-A", profitCenterId: "PC-RJ", currentTariff: new Decimal(60_000) },
        { id: "SVC-B", profitCenterId: "PC-RJ", currentTariff: new Decimal(55_000) },
      ]);
      const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

      await service.processRun(payload);

      const call = (tx.serviceUnitCost.createMany as jest.Mock).mock.calls[0][0];
      const byServiceId = Object.fromEntries(call.data.map((row: { serviceId: string }) => [row.serviceId, row]));

      expect(byServiceId["SVC-A"]).toEqual({
        allocationRunId: "run-1",
        serviceId: "SVC-A",
        serviceAllocatedCost: "5740000.00",
        serviceDirectCost: "0.00",
        serviceVolume: "100.00",
        unitCost: "57400.0000",
        currentTariff: "60000.00",
        tariffGap: "2600.0000",
        targetMarginUsed: "20.0000",
        recommendedTariff: "71750.0000",
      });
      expect(byServiceId["SVC-B"]).toEqual({
        allocationRunId: "run-1",
        serviceId: "SVC-B",
        serviceAllocatedCost: "2460000.00",
        serviceDirectCost: "0.00",
        serviceVolume: "50.00",
        unitCost: "49200.0000",
        currentTariff: "55000.00",
        tariffGap: "5800.0000",
        targetMarginUsed: "20.0000",
        recommendedTariff: "61500.0000",
      });
    });

    /**
     * MANUAL CALCULATION: profit center with allocated_cost 10,000,000 and
     * two services, both with zero revenue this period (0/0 apportionment
     * ratio undefined) -> equal split across the 2 services.
     *   SVC-A share = 10,000,000/2 = 5,000,000
     *   SVC-B share = 10,000,000/2 = 5,000,000
     */
    it("falls back to an equal split across services when the profit center's total revenue is zero", async () => {
      const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
      (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-X" }]);
      (prisma.allocatedCost.groupBy as jest.Mock).mockResolvedValue([{ targetProfitCenterId: "PC-X", _sum: { amount: 10_000_000 } }]);
      (prisma.service.findMany as jest.Mock).mockResolvedValue([
        { id: "SVC-A", profitCenterId: "PC-X", currentTariff: null },
        { id: "SVC-B", profitCenterId: "PC-X", currentTariff: null },
      ]);
      const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

      await service.processRun(payload);

      const call = (tx.serviceUnitCost.createMany as jest.Mock).mock.calls[0][0];
      const amounts = call.data.map((row: { serviceAllocatedCost: string }) => row.serviceAllocatedCost);
      expect(amounts.sort()).toEqual(["5000000.00", "5000000.00"]);
    });

    it("writes unit_cost/tariff_gap/recommended_tariff = null when service_volume is zero", async () => {
      const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
      (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-X" }]);
      (prisma.allocatedCost.groupBy as jest.Mock).mockResolvedValue([{ targetProfitCenterId: "PC-X", _sum: { amount: 1_000_000 } }]);
      (prisma.service.findMany as jest.Mock).mockResolvedValue([{ id: "SVC-A", profitCenterId: "PC-X", currentTariff: new Decimal(1000) }]);
      const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

      await service.processRun(payload);

      const call = (tx.serviceUnitCost.createMany as jest.Mock).mock.calls[0][0];
      expect(call.data[0]).toMatchObject({ unitCost: null, tariffGap: null, recommendedTariff: null });
    });

    it("does not fail the whole batch when a service's target margin is out of range for recommendedTariff — only nulls that field", async () => {
      const { prisma, tx, tenantContextService, targetMarginService } = makeDeps();
      (targetMarginService.resolveForService as jest.Mock).mockResolvedValue(new Decimal(100));
      (prisma.profitCenter.findMany as jest.Mock).mockResolvedValue([{ id: "PC-X" }]);
      (prisma.allocatedCost.groupBy as jest.Mock).mockResolvedValue([{ targetProfitCenterId: "PC-X", _sum: { amount: 1_000_000 } }]);
      (prisma.revenueEntry.groupBy as jest.Mock).mockImplementation((args: { by: string[] }) =>
        args.by[0] === "serviceId" ? Promise.resolve([{ serviceId: "SVC-A", _sum: { revenue: 100, volume: 10 } }]) : Promise.resolve([])
      );
      (prisma.service.findMany as jest.Mock).mockResolvedValue([{ id: "SVC-A", profitCenterId: "PC-X", currentTariff: null }]);
      const service = new ProfitabilityEngineService(prisma, tenantContextService, targetMarginService);

      await service.processRun(payload);

      const call = (tx.serviceUnitCost.createMany as jest.Mock).mock.calls[0][0];
      expect(call.data[0].unitCost).not.toBeNull();
      expect(call.data[0].recommendedTariff).toBeNull();
    });
  });
});
