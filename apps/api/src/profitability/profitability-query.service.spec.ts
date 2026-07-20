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
    period: { findMany: jest.fn().mockResolvedValue([]) },
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
