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
