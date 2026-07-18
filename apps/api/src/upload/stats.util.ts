/** docs/07_VALIDATION_ENGINE.md §3: "trailing 6-period rolling mean/stddev". */
export function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[], avg = mean(values)): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
