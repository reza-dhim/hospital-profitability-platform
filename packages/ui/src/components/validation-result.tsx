import { AlertCircle, AlertTriangle } from "lucide-react";
import { Skeleton } from "./loading-skeleton";
import { cn } from "../lib/cn";

export interface ValidationResultError {
  rowNumber: number | null;
  column: string | null;
  code: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResultSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
}

export interface ValidationResultProps {
  summary: ValidationResultSummary;
  errors: ValidationResultError[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  className?: string;
}

const SEVERITY_META = {
  error: { icon: AlertTriangle, label: "Error", tone: "text-destructive" },
  warning: { icon: AlertCircle, label: "Peringatan", tone: "text-amber-600 dark:text-amber-400" },
} as const;

/**
 * Row-level validation summary/detail, grouped by severity, per
 * docs/37_COMPONENT_LIBRARY.md §3 and docs/07_VALIDATION_ENGINE.md §4's API
 * contract. Errors are always listed before warnings (they block
 * confirmation entirely — docs/07 §2) rather than in raw row order.
 * Severity is never color-only (docs/35_ACCESSIBILITY.md §2): each row
 * pairs its tone with an icon and a text label.
 */
export function ValidationResult({
  summary,
  errors,
  page,
  totalPages,
  onPageChange,
  loading = false,
  className,
}: ValidationResultProps) {
  if (loading) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const sorted = [...errors].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryStat label="Total Baris" value={summary.totalRows} />
        <SummaryStat label="Valid" value={summary.validRows} tone="text-emerald-600 dark:text-emerald-400" />
        <SummaryStat label="Error" value={summary.errorRows} tone="text-destructive" />
        <SummaryStat label="Peringatan" value={summary.warningRows} tone="text-amber-600 dark:text-amber-400" />
      </div>

      {sorted.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Baris</th>
                <th className="px-4 py-3 font-medium">Kolom</th>
                <th className="px-4 py-3 font-medium">Tingkat</th>
                <th className="px-4 py-3 font-medium">Pesan</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((error, index) => {
                const meta = SEVERITY_META[error.severity];
                const Icon = meta.icon;
                return (
                  <tr key={`${error.rowNumber ?? "file"}-${error.code}-${index}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 tabular-nums">{error.rowNumber ?? "—"}</td>
                    <td className="px-4 py-3">{error.column ?? "—"}</td>
                    <td className={cn("px-4 py-3", meta.tone)}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{error.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-sm border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-sm border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold", tone ?? "text-foreground")}>{value}</p>
    </div>
  );
}
