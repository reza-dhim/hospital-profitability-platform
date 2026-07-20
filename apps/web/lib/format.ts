/**
 * Shared financial-figure formatting (docs/37_COMPONENT_LIBRARY.md §5:
 * "components consuming financial figures never format/round independently").
 * Every KPI card on the dashboard goes through these instead of formatting inline.
 */

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatCurrencyIDR(value: string | number): string {
  return currencyFormatter.format(Number(value));
}

/** `value` is already a percentage number (e.g. 15.23 for 15.23%), matching `@hpp/domain`'s `margin()`/`variance()` output — never re-scaled here. */
export function formatPercent(value: string | number, fractionDigits = 1): string {
  return `${Number(value).toFixed(fractionDigits)}%`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export interface VarianceLike {
  absolute: string;
  percentage: string | null;
}

export interface FormattedTrend {
  label: string;
  direction: "up" | "down" | "flat";
}

/** Builds a `MetricCard` trend prop from a `VarianceDto`, formatting the absolute delta with `formatAbsolute` (currency or percentage-point, depending on the KPI). */
export function trendFromVariance(variance: VarianceLike | null, formatAbsolute: (value: string) => string): FormattedTrend | null {
  if (!variance) return null;
  const numeric = Number(variance.absolute);
  const direction = numeric > 0 ? "up" : numeric < 0 ? "down" : "flat";
  const sign = numeric > 0 ? "+" : "";
  const percentageSuffix = variance.percentage !== null ? ` (${sign}${formatPercent(variance.percentage)})` : "";
  return { direction, label: `${sign}${formatAbsolute(variance.absolute)}${percentageSuffix}` };
}
