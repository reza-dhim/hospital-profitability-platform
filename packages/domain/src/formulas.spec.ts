import {
  allocatedCost,
  driverPercentage,
  unitCost,
  grossProfit,
  margin,
  tariffGap,
  recommendedTariff,
  variance,
  percentile,
  cohortDistribution,
  percentileBand,
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

describe("percentile", () => {
  /**
   * MANUAL CALCULATION (linear interpolation, numpy/Excel default):
   * sorted [10, 20, 30, 40], N=4.
   *   P25: rank = 0.25*(4-1) = 0.75 -> between index 0 (10) and 1 (20), fraction 0.75 -> 10 + 10*0.75 = 17.5
   *   P50: rank = 0.50*3 = 1.5     -> between index 1 (20) and 2 (30), fraction 0.5  -> 20 + 10*0.5  = 25
   *   P75: rank = 0.75*3 = 2.25    -> between index 2 (30) and 3 (40), fraction 0.25 -> 30 + 10*0.25 = 32.5
   *   P90: rank = 0.90*3 = 2.7     -> between index 2 (30) and 3 (40), fraction 0.7  -> 30 + 10*0.7  = 37
   */
  it("matches the hand-computed linear interpolation exactly for a 4-element distribution", () => {
    const values = [10, 20, 30, 40];
    expect(percentile(values, 25)!.toNumber()).toBe(17.5);
    expect(percentile(values, 50)!.toNumber()).toBe(25);
    expect(percentile(values, 75)!.toNumber()).toBe(32.5);
    expect(percentile(values, 90)!.toNumber()).toBe(37);
  });

  it("returns the single value regardless of p for a single-element distribution", () => {
    expect(percentile([100], 0)!.toNumber()).toBe(100);
    expect(percentile([100], 50)!.toNumber()).toBe(100);
    expect(percentile([100], 100)!.toNumber()).toBe(100);
  });

  it("interpolates exactly between the two values for a two-element distribution", () => {
    expect(percentile([10, 30], 50)!.toNumber()).toBe(20);
  });

  it("returns the exact value with no interpolation when the rank lands precisely on an index", () => {
    // [10, 20, 30], P50 -> rank = 0.5*2 = 1.0 exactly -> index 1 -> 20, no interpolation.
    expect(percentile([10, 20, 30], 50)!.toNumber()).toBe(20);
  });

  it("returns null for an empty distribution", () => {
    expect(percentile([], 50)).toBeNull();
  });

  it("sorts unsorted input before computing rank", () => {
    expect(percentile([40, 10, 30, 20], 50)!.toNumber()).toBe(25);
  });

  it("throws RangeError for p outside [0, 100]", () => {
    expect(() => percentile([1, 2, 3], -1)).toThrow(RangeError);
    expect(() => percentile([1, 2, 3], 101)).toThrow(RangeError);
  });
});

describe("cohortDistribution", () => {
  it("returns median/p25/p75/p90/doctorCount matching the percentile() worked example", () => {
    const result = cohortDistribution([10, 20, 30, 40])!;
    expect(result.median.toNumber()).toBe(25);
    expect(result.p25.toNumber()).toBe(17.5);
    expect(result.p75.toNumber()).toBe(32.5);
    expect(result.p90.toNumber()).toBe(37);
    expect(result.doctorCount).toBe(4);
  });

  it("returns null for an empty cohort", () => {
    expect(cohortDistribution([])).toBeNull();
  });
});

describe("percentileBand", () => {
  const cohort = cohortDistribution([10, 20, 30, 40])!; // p25=17.5, p75=32.5, p90=37

  it("classifies a value at or below p25 as below_p25", () => {
    expect(percentileBand(15, cohort)).toBe("below_p25");
    expect(percentileBand(17.5, cohort)).toBe("below_p25"); // boundary is inclusive-below, not gte
  });

  it("classifies a value between p25 and p75 as p25_p75", () => {
    expect(percentileBand(20, cohort)).toBe("p25_p75");
  });

  it("classifies a value between p75 and p90 as p75_p90", () => {
    expect(percentileBand(35, cohort)).toBe("p75_p90");
  });

  it("classifies a value above p90 as above_p90", () => {
    expect(percentileBand(40, cohort)).toBe("above_p90");
  });
});
