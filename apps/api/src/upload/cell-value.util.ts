import type { Cell, CellValue } from "exceljs";

/**
 * docs/06_UPLOAD_ENGINE.md §4: "any cell beginning with =, +, -, @ is
 * treated as literal text, never evaluated, when read server-side". exceljs
 * never executes formulas itself (it's not a spreadsheet engine — a formula
 * cell's `.value` is `{ formula, result }`, where `result` is whatever
 * Excel last cached, not something we compute) — the risk this guards
 * against is a plain-text cell whose CONTENT merely starts with one of
 * these characters, which could re-trigger formula evaluation if the raw
 * value is ever re-exported into a spreadsheet tool downstream. Prefixing
 * with `'` (Excel's own "force text" marker) neutralizes that.
 */
export function cellTextValue(cell: Cell): string | number | null {
  const raw = resolveRawValue(cell.value);
  if (typeof raw === "string" && /^[=+\-@]/.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

function resolveRawValue(value: CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("result" in value) return resolveRawValue((value as { result: CellValue }).result);
    if ("text" in value) return String((value as { text: unknown }).text);
    return null;
  }
  return value;
}
