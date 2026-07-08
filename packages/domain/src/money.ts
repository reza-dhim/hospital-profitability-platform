import Decimal from "decimal.js";

/**
 * All currency and percentage figures in this package use decimal.js, never
 * native floating point, per docs/18_FORMULA_REFERENCE.md §3. Callers may pass
 * string, number, or Decimal — results are always Decimal so precision never
 * degrades across a chain of calculations.
 */
export type Numeric = Decimal.Value;

export { Decimal };

export function toDecimal(value: Numeric): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function isZero(value: Numeric): boolean {
  return toDecimal(value).isZero();
}
