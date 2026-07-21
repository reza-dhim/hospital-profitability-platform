import { Decimal, toDecimal, type Numeric } from "./money";

/**
 * Single-implementation home for every formula in docs/18_FORMULA_REFERENCE.md
 * §1, sourced from docs/PRODUCT_BIBLE.md §6. Per docs/18_FORMULA_REFERENCE.md
 * §2, no other package/module may re-implement these — the Cost Allocation
 * Engine (docs/08_COST_ALLOCATION_ENGINE.md), Profitability Engine
 * (docs/09_PROFITABILITY_ENGINE.md), and Unit Cost Engine
 * (docs/10_UNIT_COST_ENGINE.md) import from here once built (Sprint 5-6).
 *
 * Framework-free: no Prisma, no NestJS. Package boundary per
 * docs/00_DOCUMENTATION_INDEX.md — imported by apps/api only.
 */

/** Allocated Cost = Total Cost Center Cost × Driver Percentage. */
export function allocatedCost(totalCostCenterCost: Numeric, driverPercentage: Numeric): Decimal {
  return toDecimal(totalCostCenterCost).times(toDecimal(driverPercentage));
}

/**
 * Driver Percentage = driver_values(target) / SUM(driver_values(all targets)).
 * Returns `null` when the total is zero — no driver data exists at all for
 * this driver in the period (docs/08_COST_ALLOCATION_ENGINE.md §5's
 * W_NO_DRIVER_DATA case), which the caller must surface as a warning, not a
 * silent zero.
 */
export function driverPercentage(targetValue: Numeric, totalValue: Numeric): Decimal | null {
  const total = toDecimal(totalValue);
  if (total.isZero()) return null;
  return toDecimal(targetValue).dividedBy(total);
}

/**
 * Unit Cost = Total Allocated Cost / Service Volume.
 * Returns `null` when volume is zero (docs/10_UNIT_COST_ENGINE.md §2 guard —
 * "No volume this period", never a divide-by-zero error or a misleading 0).
 */
export function unitCost(totalAllocatedCost: Numeric, serviceVolume: Numeric): Decimal | null {
  const volume = toDecimal(serviceVolume);
  if (volume.isZero()) return null;
  return toDecimal(totalAllocatedCost).dividedBy(volume);
}

/** Gross Profit = Revenue − Direct Cost − Allocated Cost. */
export function grossProfit(revenue: Numeric, directCost: Numeric, allocatedCost: Numeric): Decimal {
  return toDecimal(revenue).minus(toDecimal(directCost)).minus(toDecimal(allocatedCost));
}

/**
 * Margin = Gross Profit / Revenue × 100.
 * Returns `null` when revenue is zero (docs/09_PROFITABILITY_ENGINE.md §2
 * guard — margin is undefined, not a divide-by-zero error).
 */
export function margin(grossProfit: Numeric, revenue: Numeric): Decimal | null {
  const rev = toDecimal(revenue);
  if (rev.isZero()) return null;
  return toDecimal(grossProfit).dividedBy(rev).times(100);
}

/** Tariff Gap = Current Tariff − Unit Cost. */
export function tariffGap(currentTariff: Numeric, unitCost: Numeric): Decimal {
  return toDecimal(currentTariff).minus(toDecimal(unitCost));
}

/**
 * Recommended Tariff = Unit Cost / (1 − Target Margin).
 * Target Margin is a fraction (0.15, not 15). Throws when target margin is
 * ≥ 1 (100%) or negative — an invalid configuration, not a runtime data gap,
 * so it surfaces as a 422 business-rule violation (docs/17_ERROR_HANDLING.md
 * §2) at the call site rather than returning a nonsensical negative tariff.
 */
export function recommendedTariff(unitCost: Numeric, targetMargin: Numeric): Decimal {
  const margin = toDecimal(targetMargin);
  if (margin.gte(1) || margin.isNegative()) {
    throw new RangeError(`targetMargin must be in [0, 1); received ${margin.toString()}`);
  }
  return toDecimal(unitCost).dividedBy(new Decimal(1).minus(margin));
}

export interface VarianceResult {
  /** Current − prior, same unit as the inputs (currency or unit-cost). */
  absolute: Decimal;
  /** (Current − prior) / prior × 100. Null when prior is zero — a percentage change from zero is undefined, not ±Infinity. */
  percentage: Decimal | null;
}

/**
 * Variance = current period's figure − the trailing period's equivalent
 * (docs/09_PROFITABILITY_ENGINE.md §5), expressed both as absolute and
 * percentage. Applies to either `total_cost` (profitability view) or
 * `unit_cost` (unit cost view) — same formula either way, just a different
 * input. v1 is period-over-period only; no budget/standard-cost baseline
 * exists yet (`40_PRODUCT_ROADMAP.md` candidate).
 */
export function variance(current: Numeric, prior: Numeric): VarianceResult {
  const currentDecimal = toDecimal(current);
  const priorDecimal = toDecimal(prior);
  const absolute = currentDecimal.minus(priorDecimal);
  const percentage = priorDecimal.isZero() ? null : absolute.dividedBy(priorDecimal).times(100);
  return { absolute, percentage };
}

/**
 * Linear-interpolation percentile (numpy/Excel default method) over a
 * numeric distribution — docs/11_DOCTOR_ANALYTICS.md §3's cross-doctor
 * unit-cost-equivalent distribution (median, P25, P75, P90). Returns
 * `null` for an empty input — "no data" is distinct from "0", same
 * null-guard philosophy as every other formula here. Throws for `p`
 * outside `[0, 100]` — an invalid call, not a runtime data gap.
 */
export function percentile(values: Numeric[], p: number): Decimal | null {
  if (values.length === 0) return null;
  if (p < 0 || p > 100) {
    throw new RangeError(`p must be in [0, 100]; received ${p}`);
  }
  const sorted = values.map(toDecimal).sort((a, b) => a.comparedTo(b));
  if (sorted.length === 1) return sorted[0]!;
  const rank = new Decimal(p).dividedBy(100).times(sorted.length - 1);
  const lowerIndex = Math.floor(rank.toNumber());
  const upperIndex = Math.ceil(rank.toNumber());
  const lower = sorted[lowerIndex]!;
  if (lowerIndex === upperIndex) return lower;
  const upper = sorted[upperIndex]!;
  const fraction = rank.minus(lowerIndex);
  return lower.plus(upper.minus(lower).times(fraction));
}

export interface CohortDistribution {
  median: Decimal;
  p25: Decimal;
  p75: Decimal;
  p90: Decimal;
  doctorCount: number;
}

/** docs/11_DOCTOR_ANALYTICS.md §3's exact set of cut points, computed once per cohort. Returns `null` for an empty cohort. */
export function cohortDistribution(values: Numeric[]): CohortDistribution | null {
  if (values.length === 0) return null;
  return {
    median: percentile(values, 50)!,
    p25: percentile(values, 25)!,
    p75: percentile(values, 75)!,
    p90: percentile(values, 90)!,
    doctorCount: values.length,
  };
}

export type PercentileBand = "below_p25" | "p25_p75" | "p75_p90" | "above_p90";

/** Which of docs/11_DOCTOR_ANALYTICS.md §3's four bands a value falls into, given a cohort's cut points. */
export function percentileBand(value: Numeric, cohort: CohortDistribution): PercentileBand {
  const v = toDecimal(value);
  if (v.gt(cohort.p90)) return "above_p90";
  if (v.gt(cohort.p75)) return "p75_p90";
  if (v.gt(cohort.p25)) return "p25_p75";
  return "below_p25";
}
