import { NotFoundException } from "@nestjs/common";
import { Decimal } from "@hpp/domain";
import { ProfitabilityQueryService } from "./profitability-query.service";
import type { PrismaService } from "../prisma/prisma.service";

const completedRun = { id: "run-1", hospitalId: "hospital-1", periodId: "period-1", status: "completed", isStale: false };

function makeDeps() {
  const prisma = {
    allocationRun: { findFirst: jest.fn().mockResolvedValue(completedRun) },
    profitabilityResult: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    serviceUnitCost: { findMany: jest.fn().mockResolvedValue([]) },
    profitCenter: { findFirst: jest.fn() },
    // Defaults to "no trailing period" so existing tests that don't care
    // about variance keep getting totalCostVariance/unitCostVariance = null.
    period: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  return { prisma };
}

describe("ProfitabilityQueryService run resolution", () => {
  it("resolves to the latest completed, non-stale run when no allocationRunId is given", async () => {
    const { prisma } = makeDeps();
    const service = new ProfitabilityQueryService(prisma);

    await service.summary("hospital-1", { periodId: "period-1" });

    expect(prisma.allocationRun.findFirst).toHaveBeenCalledWith({
      where: { hospitalId: "hospital-1", periodId: "period-1", status: "completed", isStale: false },
      orderBy: { createdAt: "desc" },
    });
  });

  it("uses the explicit allocationRunId when given, regardless of status/staleness", async () => {
    const { prisma } = makeDeps();
    const service = new ProfitabilityQueryService(prisma);

    await service.summary("hospital-1", { periodId: "period-1", allocationRunId: "run-9" });

    expect(prisma.allocationRun.findFirst).toHaveBeenCalledWith({
      where: { id: "run-9", hospitalId: "hospital-1", periodId: "period-1" },
    });
  });

  it("throws NotFoundException when no completed run exists for the period", async () => {
    const { prisma } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ProfitabilityQueryService(prisma);

    await expect(service.summary("hospital-1", { periodId: "period-1" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when the explicit allocationRunId doesn't exist for this hospital/period", async () => {
    const { prisma } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ProfitabilityQueryService(prisma);

    await expect(
      service.summary("hospital-1", { periodId: "period-1", allocationRunId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ProfitabilityQueryService.summary", () => {
  it("sums revenue/cost/gross_profit across profit centers and computes overall margin", async () => {
    const { prisma } = makeDeps();
    (prisma.profitabilityResult.findMany as jest.Mock).mockResolvedValue([
      { revenue: new Decimal(100_000_000), totalCost: new Decimal(60_000_000), grossProfit: new Decimal(40_000_000) },
      { revenue: new Decimal(50_000_000), totalCost: new Decimal(40_000_000), grossProfit: new Decimal(10_000_000) },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.summary("hospital-1", { periodId: "period-1" });

    expect(result).toEqual({
      allocationRunId: "run-1",
      periodId: "period-1",
      profitCenterCount: 2,
      totalRevenue: "150000000.00",
      totalCost: "100000000.00",
      totalGrossProfit: "50000000.00",
      // 50,000,000 / 150,000,000 * 100 = 33.3333...%
      overallMargin: "33.3333",
      totalRevenueVariance: null,
      totalCostVariance: null,
      totalGrossProfitVariance: null,
      overallMarginVariance: null,
    });
  });

  it("returns overallMargin = null when total revenue is zero", async () => {
    const { prisma } = makeDeps();
    (prisma.profitabilityResult.findMany as jest.Mock).mockResolvedValue([
      { revenue: new Decimal(0), totalCost: new Decimal(0), grossProfit: new Decimal(0) },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.summary("hospital-1", { periodId: "period-1" });

    expect(result.overallMargin).toBeNull();
  });
});

describe("ProfitabilityQueryService.profitCenters", () => {
  it("sorts by margin descending by default, with null-margin rows always last", async () => {
    const { prisma } = makeDeps();
    (prisma.profitabilityResult.findMany as jest.Mock).mockResolvedValue([
      {
        profitCenterId: "pc-low",
        profitCenter: { code: "PC-LOW", name: "Low" },
        revenue: new Decimal(1),
        directCost: new Decimal(0),
        allocatedCost: new Decimal(0),
        totalCost: new Decimal(0),
        grossProfit: new Decimal(0),
        margin: new Decimal(5),
      },
      {
        profitCenterId: "pc-zero-rev",
        profitCenter: { code: "PC-ZERO", name: "Zero Revenue" },
        revenue: new Decimal(0),
        directCost: new Decimal(0),
        allocatedCost: new Decimal(0),
        totalCost: new Decimal(0),
        grossProfit: new Decimal(0),
        margin: null,
      },
      {
        profitCenterId: "pc-high",
        profitCenter: { code: "PC-HIGH", name: "High" },
        revenue: new Decimal(1),
        directCost: new Decimal(0),
        allocatedCost: new Decimal(0),
        totalCost: new Decimal(0),
        grossProfit: new Decimal(0),
        margin: new Decimal(50),
      },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.profitCenters("hospital-1", { periodId: "period-1" });

    expect(result.data.map((r) => r.profitCenterId)).toEqual(["pc-high", "pc-low", "pc-zero-rev"]);
  });

  it("sorts by grossProfit ascending when requested", async () => {
    const { prisma } = makeDeps();
    (prisma.profitabilityResult.findMany as jest.Mock).mockResolvedValue([
      {
        profitCenterId: "pc-a",
        profitCenter: { code: "A", name: "A" },
        revenue: new Decimal(1),
        directCost: new Decimal(0),
        allocatedCost: new Decimal(0),
        totalCost: new Decimal(0),
        grossProfit: new Decimal(30),
        margin: new Decimal(1),
      },
      {
        profitCenterId: "pc-b",
        profitCenter: { code: "B", name: "B" },
        revenue: new Decimal(1),
        directCost: new Decimal(0),
        allocatedCost: new Decimal(0),
        totalCost: new Decimal(0),
        grossProfit: new Decimal(10),
        margin: new Decimal(1),
      },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.profitCenters("hospital-1", { periodId: "period-1", sortBy: "grossProfit", order: "asc" });

    expect(result.data.map((r) => r.profitCenterId)).toEqual(["pc-b", "pc-a"]);
  });
});

describe("ProfitabilityQueryService.services", () => {
  it("maps service_unit_costs rows with joined service code/name", async () => {
    const { prisma } = makeDeps();
    (prisma.serviceUnitCost.findMany as jest.Mock).mockResolvedValue([
      {
        serviceId: "svc-1",
        service: { code: "SVC-1", name: "Konsultasi", profitCenterId: "pc-1" },
        serviceAllocatedCost: new Decimal(5_000_000),
        serviceDirectCost: new Decimal(0),
        serviceVolume: new Decimal(100),
        unitCost: new Decimal(50_000),
        currentTariff: new Decimal(60_000),
        tariffGap: new Decimal(10_000),
        targetMarginUsed: new Decimal(15),
        recommendedTariff: new Decimal(58_823.5294),
      },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.services("hospital-1", { periodId: "period-1" });

    expect(result.data[0]).toMatchObject({
      serviceId: "svc-1",
      serviceCode: "SVC-1",
      serviceName: "Konsultasi",
      profitCenterId: "pc-1",
      unitCost: "50000.0000",
      tariffGap: "10000.0000",
    });
  });
});

describe("ProfitabilityQueryService period-over-period variance (docs/09_PROFITABILITY_ENGINE.md §5)", () => {
  const currentPeriod = { id: "period-1", startDate: new Date("2026-02-01") };
  const trailingPeriod = { id: "period-0", startDate: new Date("2026-01-01") };
  const trailingRun = { id: "run-0", hospitalId: "hospital-1", periodId: "period-0", status: "completed", isStale: false };

  function mockTrailingPeriodAndRun(prisma: PrismaService) {
    (prisma.period.findFirst as jest.Mock).mockImplementation((args: { where: { id?: string; startDate?: unknown } }) => {
      if (args.where.id === "period-1") return Promise.resolve(currentPeriod);
      if (args.where.startDate) return Promise.resolve(trailingPeriod);
      return Promise.resolve(null);
    });
    (prisma.allocationRun.findFirst as jest.Mock).mockImplementation((args: { where: { periodId: string } }) =>
      Promise.resolve(args.where.periodId === "period-0" ? trailingRun : completedRun)
    );
  }

  /**
   * MANUAL CALCULATION: current period totals revenue=150,000,000,
   * totalCost=100,000,000, grossProfit=50,000,000 (overallMargin =
   * 50,000,000/150,000,000×100 = 33.3333...%). Trailing period totals
   * revenue=120,000,000, totalCost=90,000,000, grossProfit=30,000,000
   * (overallMargin = 30,000,000/120,000,000×100 = 25% exactly).
   *   totalRevenueVariance:     abs = 150,000,000−120,000,000 = 30,000,000
   *                             pct = 30,000,000/120,000,000×100 = 25%
   *   totalCostVariance:        abs = 100,000,000−90,000,000 = 10,000,000
   *                             pct = 10,000,000/90,000,000×100 = 11.1111...%
   *   totalGrossProfitVariance: abs = 50,000,000−30,000,000 = 20,000,000
   *                             pct = 20,000,000/30,000,000×100 = 66.6666...% ≈ 66.6667%
   *   overallMarginVariance:    abs = 33.3333...−25 = 8.3333...%
   *                             pct = 8.3333.../25×100 = 33.3333...%
   */
  it("computes summary-level variance for every KPI against the trailing period's latest completed run", async () => {
    const { prisma } = makeDeps();
    mockTrailingPeriodAndRun(prisma);
    (prisma.profitabilityResult.findMany as jest.Mock).mockImplementation((args: { where: { allocationRunId: string } }) => {
      if (args.where.allocationRunId === "run-1") {
        return Promise.resolve([
          { profitCenterId: "pc-1", revenue: new Decimal(150_000_000), totalCost: new Decimal(100_000_000), grossProfit: new Decimal(50_000_000) },
        ]);
      }
      return Promise.resolve([
        { profitCenterId: "pc-1", revenue: new Decimal(120_000_000), totalCost: new Decimal(90_000_000), grossProfit: new Decimal(30_000_000) },
      ]);
    });
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.summary("hospital-1", { periodId: "period-1" });

    expect(result.totalRevenueVariance).toEqual({ absolute: "30000000.00", percentage: "25.0000" });
    expect(result.totalCostVariance).toEqual({ absolute: "10000000.00", percentage: "11.1111" });
    expect(result.totalGrossProfitVariance).toEqual({ absolute: "20000000.00", percentage: "66.6667" });
    expect(result.overallMarginVariance).toEqual({ absolute: "8.3333", percentage: "33.3333" });
  });

  it("returns all summary variance fields = null when there is no trailing period", async () => {
    const { prisma } = makeDeps();
    // period.findFirst already defaults to null (no trailing period found).
    (prisma.profitabilityResult.findMany as jest.Mock).mockResolvedValue([
      { profitCenterId: "pc-1", revenue: new Decimal(150_000_000), totalCost: new Decimal(100_000_000), grossProfit: new Decimal(50_000_000) },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.summary("hospital-1", { periodId: "period-1" });

    expect(result.totalRevenueVariance).toBeNull();
    expect(result.totalCostVariance).toBeNull();
    expect(result.totalGrossProfitVariance).toBeNull();
    expect(result.overallMarginVariance).toBeNull();
  });

  it("returns overallMarginVariance = null when the trailing period's overall margin is undefined (zero revenue)", async () => {
    const { prisma } = makeDeps();
    mockTrailingPeriodAndRun(prisma);
    (prisma.profitabilityResult.findMany as jest.Mock).mockImplementation((args: { where: { allocationRunId: string } }) => {
      if (args.where.allocationRunId === "run-1") {
        return Promise.resolve([
          { profitCenterId: "pc-1", revenue: new Decimal(150_000_000), totalCost: new Decimal(100_000_000), grossProfit: new Decimal(50_000_000) },
        ]);
      }
      // Trailing period had zero revenue -> overallMargin is null there.
      return Promise.resolve([{ profitCenterId: "pc-1", revenue: new Decimal(0), totalCost: new Decimal(0), grossProfit: new Decimal(0) }]);
    });
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.summary("hospital-1", { periodId: "period-1" });

    expect(result.overallMarginVariance).toBeNull();
    // Other KPIs still compare fine — only overallMarginVariance is affected by the null-margin guard.
    expect(result.totalRevenueVariance).toEqual({ absolute: "150000000.00", percentage: null });
  });

  /**
   * MANUAL CALCULATION (same figures as packages/domain's variance test):
   * current period total_cost 14,100,000, trailing period total_cost
   * 12,000,000.
   *   absolute   = 14,100,000 − 12,000,000 = 2,100,000
   *   percentage = 2,100,000 / 12,000,000 × 100 = 17.5%
   */
  it("computes totalCostVariance for a profit center against the trailing period's latest completed run", async () => {
    const { prisma } = makeDeps();
    mockTrailingPeriodAndRun(prisma);
    (prisma.profitabilityResult.findMany as jest.Mock).mockImplementation((args: { where: { allocationRunId: string } }) => {
      if (args.where.allocationRunId === "run-1") {
        return Promise.resolve([
          {
            profitCenterId: "pc-1",
            profitCenter: { code: "PC-1", name: "PC One" },
            revenue: new Decimal(1),
            directCost: new Decimal(0),
            allocatedCost: new Decimal(0),
            totalCost: new Decimal(14_100_000),
            grossProfit: new Decimal(0),
            margin: new Decimal(1),
          },
        ]);
      }
      return Promise.resolve([{ profitCenterId: "pc-1", totalCost: new Decimal(12_000_000) }]);
    });
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.profitCenters("hospital-1", { periodId: "period-1" });

    expect(result.data[0]!.totalCostVariance).toEqual({ absolute: "2100000.00", percentage: "17.5000" });
  });

  /**
   * MANUAL CALCULATION: current unit_cost 68,000, trailing unit_cost
   * 80,000.
   *   absolute   = 68,000 − 80,000 = −12,000
   *   percentage = −12,000 / 80,000 × 100 = −15%
   */
  it("computes unitCostVariance for a service against the trailing period's latest completed run", async () => {
    const { prisma } = makeDeps();
    mockTrailingPeriodAndRun(prisma);
    (prisma.serviceUnitCost.findMany as jest.Mock).mockImplementation((args: { where: { allocationRunId: string } }) => {
      if (args.where.allocationRunId === "run-1") {
        return Promise.resolve([
          {
            serviceId: "svc-1",
            service: { code: "SVC-1", name: "Svc One", profitCenterId: "pc-1" },
            serviceAllocatedCost: new Decimal(1),
            serviceDirectCost: new Decimal(0),
            serviceVolume: new Decimal(1),
            unitCost: new Decimal(68_000),
            currentTariff: null,
            tariffGap: null,
            targetMarginUsed: new Decimal(15),
            recommendedTariff: null,
          },
        ]);
      }
      return Promise.resolve([{ serviceId: "svc-1", unitCost: new Decimal(80_000) }]);
    });
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.services("hospital-1", { periodId: "period-1" });

    expect(result.data[0]!.unitCostVariance).toEqual({ absolute: "-12000.0000", percentage: "-15.0000" });
  });

  it("returns totalCostVariance = null when there is no trailing period at all", async () => {
    const { prisma } = makeDeps();
    // period.findFirst already defaults to null (no trailing period found).
    (prisma.profitabilityResult.findMany as jest.Mock).mockResolvedValue([
      {
        profitCenterId: "pc-1",
        profitCenter: { code: "PC-1", name: "PC One" },
        revenue: new Decimal(1),
        directCost: new Decimal(0),
        allocatedCost: new Decimal(0),
        totalCost: new Decimal(14_100_000),
        grossProfit: new Decimal(0),
        margin: new Decimal(1),
      },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.profitCenters("hospital-1", { periodId: "period-1" });

    expect(result.data[0]!.totalCostVariance).toBeNull();
  });

  it("returns totalCostVariance = null when the trailing period exists but has no completed run", async () => {
    const { prisma } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockImplementation((args: { where: { id?: string; startDate?: unknown } }) => {
      if (args.where.id === "period-1") return Promise.resolve(currentPeriod);
      if (args.where.startDate) return Promise.resolve(trailingPeriod);
      return Promise.resolve(null);
    });
    (prisma.allocationRun.findFirst as jest.Mock).mockImplementation((args: { where: { periodId: string } }) =>
      Promise.resolve(args.where.periodId === "period-0" ? null : completedRun)
    );
    (prisma.profitabilityResult.findMany as jest.Mock).mockResolvedValue([
      {
        profitCenterId: "pc-1",
        profitCenter: { code: "PC-1", name: "PC One" },
        revenue: new Decimal(1),
        directCost: new Decimal(0),
        allocatedCost: new Decimal(0),
        totalCost: new Decimal(14_100_000),
        grossProfit: new Decimal(0),
        margin: new Decimal(1),
      },
    ]);
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.profitCenters("hospital-1", { periodId: "period-1" });

    expect(result.data[0]!.totalCostVariance).toBeNull();
  });
});

describe("ProfitabilityQueryService.trends", () => {
  it("throws NotFoundException when the profit center doesn't exist for this hospital", async () => {
    const { prisma } = makeDeps();
    (prisma.profitCenter.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ProfitabilityQueryService(prisma);

    await expect(service.trends("hospital-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("omits periods with no completed run entirely — a gap, not zero-filled", async () => {
    const { prisma } = makeDeps();
    (prisma.profitCenter.findFirst as jest.Mock).mockResolvedValue({ id: "pc-1" });
    (prisma.period.findMany as jest.Mock).mockResolvedValue([
      { id: "period-1", label: "2026-01", startDate: new Date("2026-01-01") },
      { id: "period-2", label: "2026-02", startDate: new Date("2026-02-01") },
    ]);
    (prisma.allocationRun.findFirst as jest.Mock).mockImplementation((args: { where: { periodId: string } }) =>
      Promise.resolve(args.where.periodId === "period-1" ? { id: "run-1" } : null)
    );
    (prisma.profitabilityResult.findFirst as jest.Mock).mockResolvedValue({
      revenue: new Decimal(1_000_000),
      grossProfit: new Decimal(200_000),
      margin: new Decimal(20),
    });
    const service = new ProfitabilityQueryService(prisma);

    const result = await service.trends("hospital-1", "pc-1");

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.periodId).toBe("period-1");
  });
});
