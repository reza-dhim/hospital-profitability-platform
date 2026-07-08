import { toDecimal, type Decimal, type Numeric } from "./money";

/**
 * Resolution order per docs/01_BUSINESS_RULES.md §6: service-level target
 * margin (most specific) → profit-center-level → hospital-wide default.
 * Pure function — reading the right `target_margins` row for a given scope
 * is the caller's (apps/api) job; this only encodes the precedence rule.
 */
export interface TargetMarginScope {
  serviceTargetMargin?: Numeric | null;
  profitCenterTargetMargin?: Numeric | null;
  hospitalDefaultTargetMargin: Numeric;
}

export function resolveTargetMargin(scope: TargetMarginScope): Decimal {
  const value =
    scope.serviceTargetMargin ?? scope.profitCenterTargetMargin ?? scope.hospitalDefaultTargetMargin;
  return toDecimal(value);
}
