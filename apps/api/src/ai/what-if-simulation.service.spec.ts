import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Decimal } from "@hpp/domain";
import { WhatIfSimulationService } from "./what-if-simulation.service";
import type { PrismaService } from "../prisma/prisma.service";

const completedRun = { id: "run-1", hospitalId: "hospital-1", periodId: "period-1", status: "completed", isStale: false };

const service = {
  id: "svc-1",
  code: "SVC-1",
  name: "Konsultasi",
  profitCenterId: "pc-1",
  profitCenter: { code: "PC-1", name: "Poli Umum" },
};

// Baseline: allocatedCost 2,000,000 + directCost 1,000,000 over volume 100 -> unitCost 30,000. Tariff 50,000 -> gap 20,000, recommended (20% target) 37,500.
const unitCostRow = {
  serviceAllocatedCost: new Decimal(2_000_000),
  serviceDirectCost: new Decimal(1_000_000),
  serviceVolume: new Decimal(100),
  currentTariff: new Decimal(50_000),
  targetMarginUsed: new Decimal(20),
};

// Profit center: revenue 20,000,000, directCost 6,000,000, allocatedCost 4,000,000 -> grossProfit 10,000,000, margin 50%.
const profitabilityRow = {
  revenue: new Decimal(20_000_000),
  directCost: new Decimal(6_000_000),
  allocatedCost: new Decimal(4_000_000),
};

function makeDeps(overrides: { unitCostRow?: unknown; profitabilityRow?: unknown; revenueSum?: Decimal | null } = {}) {
  const prisma = {
    allocationRun: { findFirst: jest.fn().mockResolvedValue(completedRun) },
    service: { findFirst: jest.fn().mockResolvedValue(service) },
    serviceUnitCost: { findFirst: jest.fn().mockResolvedValue(overrides.unitCostRow === undefined ? unitCostRow : overrides.unitCostRow) },
    profitabilityResult: {
      findFirst: jest.fn().mockResolvedValue(overrides.profitabilityRow === undefined ? profitabilityRow : overrides.profitabilityRow),
    },
    revenueEntry: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { revenue: overrides.revenueSum === undefined ? new Decimal(5_000_000) : overrides.revenueSum } }),
    },
  } as unknown as PrismaService;
  return { prisma };
}

const baseDto = { periodId: "period-1", serviceId: "svc-1" };

describe("WhatIfSimulationService input validation", () => {
  it("throws UnprocessableEntityException when neither hypothetical value is given", async () => {
    const { prisma } = makeDeps();
    const svc = new WhatIfSimulationService(prisma);

    await expect(svc.simulate("hospital-1", baseDto)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("throws NotFoundException when the service doesn't belong to the hospital", async () => {
    const { prisma } = makeDeps();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue(null);
    const svc = new WhatIfSimulationService(prisma);

    await expect(svc.simulate("hospital-1", { ...baseDto, hypotheticalVolume: 10 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when no completed allocation run exists for the period", async () => {
    const { prisma } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const svc = new WhatIfSimulationService(prisma);

    await expect(svc.simulate("hospital-1", { ...baseDto, hypotheticalVolume: 10 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws UnprocessableEntityException (WHAT_IF_NO_BASELINE_DATA) when the service has no unit-cost row in the run", async () => {
    const { prisma } = makeDeps({ unitCostRow: null });
    const svc = new WhatIfSimulationService(prisma);

    await expect(svc.simulate("hospital-1", { ...baseDto, hypotheticalVolume: 10 })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe("WhatIfSimulationService.simulate — worked example", () => {
  /**
   * MANUAL CALCULATION (both tariff and volume changed):
   * hypotheticalTariff=60,000, hypotheticalVolume=150 -> volumeRatio = 1.5
   *   newDirectCost = 1,000,000 * 1.5 = 1,500,000; newAllocatedCost fixed = 2,000,000 -> newTotalCost = 3,500,000
   *   newUnitCost = 3,500,000 / 150 = 23333.3333...
   *   newRevenue = 60,000 * 150 = 9,000,000
   *   newTariffGap = 60,000 - 23333.3333... = 36666.6667 (4dp)
   *   newRecommendedTariff = 23333.3333.../0.8 = 29166.6667 (4dp)
   * Service deltas (hypothetical - baseline):
   *   revenue: 9,000,000 - 5,000,000 = 4,000,000 (+80%)
   *   totalCost: 3,500,000 - 3,000,000 = 500,000 (+16.6667%)
   *   unitCost: 23333.3333... - 30,000 = -6666.6667 (-22.2222%)
   *   tariffGap: 36666.6667 - 20,000 = 16666.6667 (+83.3333%)
   * Profit-center ripple: newPcRevenue = 20,000,000 - 5,000,000 + 9,000,000 = 24,000,000
   *   newGrossProfit = 24,000,000 - 6,000,000 - 4,000,000 = 14,000,000
   *   newMargin = 14,000,000 / 24,000,000 * 100 = 58.3333%
   * PC deltas: revenue +4,000,000 (+20%), grossProfit +4,000,000 (+40%), margin +8.3333 (+16.6667%)
   */
  it("scales direct cost linearly, holds allocated cost fixed, and matches hand math for service + profit-center figures and deltas", async () => {
    const { prisma } = makeDeps();
    const svc = new WhatIfSimulationService(prisma);

    const result = await svc.simulate("hospital-1", { ...baseDto, hypotheticalTariff: 60_000, hypotheticalVolume: 150 });

    expect(result.allocationRunId).toBe("run-1");
    expect(result.serviceCode).toBe("SVC-1");
    expect(result.profitCenterCode).toBe("PC-1");

    expect(result.serviceBaseline).toEqual({
      tariff: "50000.00",
      volume: "100.00",
      allocatedCost: "2000000.00",
      directCost: "1000000.00",
      totalCost: "3000000.00",
      unitCost: "30000.0000",
      tariffGap: "20000.0000",
      recommendedTariff: "37500.0000",
      revenue: "5000000.00",
    });

    expect(result.serviceHypothetical).toEqual({
      tariff: "60000.00",
      volume: "150.00",
      allocatedCost: "2000000.00",
      directCost: "1500000.00",
      totalCost: "3500000.00",
      unitCost: "23333.3333",
      tariffGap: "36666.6667",
      recommendedTariff: "29166.6667",
      revenue: "9000000.00",
    });

    expect(result.serviceDeltas).toEqual({
      revenue: { absolute: "4000000.00", percentage: "80.0000" },
      totalCost: { absolute: "500000.00", percentage: "16.6667" },
      unitCost: { absolute: "-6666.6667", percentage: "-22.2222" },
      tariffGap: { absolute: "16666.6667", percentage: "83.3333" },
    });

    expect(result.profitCenterBaseline).toEqual({
      revenue: "20000000.00",
      directCost: "6000000.00",
      allocatedCost: "4000000.00",
      totalCost: "10000000.00",
      grossProfit: "10000000.00",
      margin: "50.0000",
    });

    expect(result.profitCenterHypothetical).toEqual({
      revenue: "24000000.00",
      directCost: "6000000.00",
      allocatedCost: "4000000.00",
      totalCost: "10000000.00",
      grossProfit: "14000000.00",
      margin: "58.3333",
    });

    expect(result.profitCenterDeltas).toEqual({
      revenue: { absolute: "4000000.00", percentage: "20.0000" },
      grossProfit: { absolute: "4000000.00", percentage: "40.0000" },
      margin: { absolute: "8.3333", percentage: "16.6667" },
    });
  });

  it("defaults hypotheticalVolume to the baseline volume when only tariff is given (volumeRatio = 1, direct cost unchanged)", async () => {
    const { prisma } = makeDeps();
    const svc = new WhatIfSimulationService(prisma);

    const result = await svc.simulate("hospital-1", { ...baseDto, hypotheticalTariff: 55_000 });

    expect(result.serviceHypothetical.volume).toBe("100.00");
    expect(result.serviceHypothetical.directCost).toBe("1000000.00"); // unchanged: ratio 1
    expect(result.serviceHypothetical.unitCost).toBe("30000.0000"); // unchanged: same total cost/volume as baseline
    expect(result.serviceHypothetical.revenue).toBe("5500000.00"); // 55,000 * 100
  });

  it("defaults hypotheticalTariff to the baseline tariff when only volume is given", async () => {
    const { prisma } = makeDeps();
    const svc = new WhatIfSimulationService(prisma);

    const result = await svc.simulate("hospital-1", { ...baseDto, hypotheticalVolume: 200 });

    // volumeRatio = 2 -> directCost 2,000,000, allocatedCost fixed 2,000,000 -> totalCost 4,000,000 / 200 = 20,000
    expect(result.serviceHypothetical.tariff).toBe("50000.00");
    expect(result.serviceHypothetical.directCost).toBe("2000000.00");
    expect(result.serviceHypothetical.unitCost).toBe("20000.0000");
    expect(result.serviceHypothetical.revenue).toBe("10000000.00"); // 50,000 * 200
  });

  it("treats a zero baseline volume as a volumeRatio of 1 rather than dividing by zero", async () => {
    const { prisma } = makeDeps({
      unitCostRow: { ...unitCostRow, serviceVolume: new Decimal(0) },
      revenueSum: new Decimal(0),
    });
    const svc = new WhatIfSimulationService(prisma);

    const result = await svc.simulate("hospital-1", { ...baseDto, hypotheticalTariff: 40_000 });

    expect(result.serviceBaseline.unitCost).toBeNull(); // unitCost() null-guards zero volume
    expect(result.serviceHypothetical.volume).toBe("0.00"); // no hypotheticalVolume given -> defaults to baseline's 0
    expect(result.serviceHypothetical.directCost).toBe("1000000.00"); // ratio falls back to 1, not NaN/Infinity
    expect(result.serviceHypothetical.unitCost).toBeNull(); // still zero volume -> still null
  });

  it("returns null unitCost/tariffGap/recommendedTariff and null deltas when hypothetical volume is zero", async () => {
    const { prisma } = makeDeps();
    const svc = new WhatIfSimulationService(prisma);

    const result = await svc.simulate("hospital-1", { ...baseDto, hypotheticalVolume: 0 });

    expect(result.serviceHypothetical.unitCost).toBeNull();
    expect(result.serviceHypothetical.tariffGap).toBeNull();
    expect(result.serviceHypothetical.recommendedTariff).toBeNull();
    expect(result.serviceDeltas.unitCost).toBeNull();
    expect(result.serviceDeltas.tariffGap).toBeNull();
  });
});
