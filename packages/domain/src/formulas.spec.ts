import {
  allocatedCost,
  driverPercentage,
  unitCost,
  grossProfit,
  margin,
  tariffGap,
  recommendedTariff,
  variance,
} from "./formulas";

describe("allocatedCost", () => {
  it("matches the Step-Down worked example in docs/08_COST_ALLOCATION_ENGINE.md §4", () => {
    // Step 1 — HRD pool = 100,000,000, driver percentages 40/40/20.
    expect(allocatedCost(100_000_000, 0.4).toNumber()).toBe(40_000_000);
    expect(allocatedCost(100_000_000, 0.2).toNumber()).toBe(20_000_000);

    // Step 2 — IT pool = 50,000,000 direct + 20,000,000 received = 70,000,000, driver 60/40.
    const itPool = allocatedCost(100_000_000, 0.2).plus(50_000_000);
    expect(itPool.toNumber()).toBe(70_000_000);
    expect(allocatedCost(itPool, 0.6).toNumber()).toBe(42_000_000);
    expect(allocatedCost(itPool, 0.4).toNumber()).toBe(28_000_000);

    // Rawat Jalan total = 40,000,000 + 42,000,000 = 82,000,000 (docs §4 result).
    const rawatJalanTotal = allocatedCost(100_000_000, 0.4).plus(allocatedCost(itPool, 0.6));
    expect(rawatJalanTotal.toNumber()).toBe(82_000_000);
  });
});

describe("driverPercentage", () => {
  it("derives the percentage from target/total (docs/01_BUSINESS_RULES.md §3)", () => {
    expect(driverPercentage(40, 100)?.toNumber()).toBe(0.4);
  });

  it("returns null when no driver data exists at all (total = 0)", () => {
    expect(driverPercentage(0, 0)).toBeNull();
  });
});

describe("unitCost", () => {
  it("divides allocated cost by volume", () => {
    expect(unitCost(1_000_000, 100)?.toNumber()).toBe(10_000);
  });

  it("returns null when volume is zero, per docs/10_UNIT_COST_ENGINE.md §2", () => {
    expect(unitCost(1_000_000, 0)).toBeNull();
  });
});

describe("grossProfit and margin", () => {
  it("computes gross profit and margin", () => {
    const gp = grossProfit(1_000_000, 300_000, 200_000);
    expect(gp.toNumber()).toBe(500_000);
    expect(margin(gp, 1_000_000)?.toNumber()).toBe(50);
  });

  it("returns null margin when revenue is zero, per docs/09_PROFITABILITY_ENGINE.md §2", () => {
    expect(margin(0, 0)).toBeNull();
  });
});

describe("tariffGap and recommendedTariff", () => {
  it("computes tariff gap", () => {
    expect(tariffGap(150_000, 120_000).toNumber()).toBe(30_000);
  });

  it("computes recommended tariff at a given target margin", () => {
    // Unit Cost 85,000, Target Margin 15% -> 85,000 / 0.85 = 100,000.
    expect(recommendedTariff(85_000, 0.15).toNumber()).toBe(100_000);
  });

  it("rejects a target margin of 100% or more", () => {
    expect(() => recommendedTariff(85_000, 1)).toThrow(RangeError);
  });

  it("rejects a negative target margin", () => {
    expect(() => recommendedTariff(85_000, -0.1)).toThrow(RangeError);
  });
});

describe("variance", () => {
  /**
   * MANUAL CALCULATION (docs/09_PROFITABILITY_ENGINE.md §5): current period
   * total_cost 14,100,000, prior period total_cost 12,000,000.
   *   absolute   = 14,100,000 − 12,000,000 = 2,100,000
   *   percentage = 2,100,000 / 12,000,000 × 100 = 17.5%
   */
  it("computes an increase's absolute and percentage change exactly", () => {
    const result = variance(14_100_000, 12_000_000);
    expect(result.absolute.toNumber()).toBe(2_100_000);
    expect(result.percentage?.toNumber()).toBe(17.5);
  });

  /**
   * MANUAL CALCULATION: current 68,000, prior 80,000 — a decrease.
   *   absolute   = 68,000 − 80,000 = −12,000
   *   percentage = −12,000 / 80,000 × 100 = −15%
   */
  it("computes a decrease as a negative absolute and percentage", () => {
    const result = variance(68_000, 80_000);
    expect(result.absolute.toNumber()).toBe(-12_000);
    expect(result.percentage?.toNumber()).toBe(-15);
  });

  it("returns percentage = null when the prior value is zero, instead of dividing by zero", () => {
    const result = variance(50_000, 0);
    expect(result.absolute.toNumber()).toBe(50_000);
    expect(result.percentage).toBeNull();
  });

  it("returns zero absolute and zero percentage when current equals prior", () => {
    const result = variance(100_000, 100_000);
    expect(result.absolute.toNumber()).toBe(0);
    expect(result.percentage?.toNumber()).toBe(0);
  });
});
