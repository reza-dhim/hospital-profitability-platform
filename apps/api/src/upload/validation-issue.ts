/** docs/07_VALIDATION_ENGINE.md §2 error-code taxonomy — the shape a rule produces before it's persisted to `validation_errors`. */
export interface ValidationIssue {
  errorCode: string;
  message: string;
  columnName?: string;
  severity: "error" | "warning";
}

export function parseNumeric(value: string | number | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
