import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "../lib/cn";

export interface DataTableColumn<T> {
  /** Field name used for the `?sort=` query param — omit for a non-sortable column (e.g. a computed/action column). */
  key?: string;
  /** Usually a plain string; `ReactNode` for cases like a header-level tooltip (e.g. clarifying a calculated-vs-AI-suggested value). */
  header: ReactNode;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  /** Current `?sort=` value, e.g. `"code"` or `"-code"` (descending) — omit to render all columns as unsorted. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Generalizes the table+pagination markup duplicated across `UploadCenter`,
 * `CostAllocation`, and `AllocationRunDetail` — Master Data multiplies that
 * pattern across a dozen entities, so it's extracted here instead of copied
 * again. Search box and filter dropdowns live in the caller (they interact
 * with entity-specific state), this component only owns the table body,
 * sortable headers, and the pagination footer.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  selectedRowId,
  sort,
  onSortChange,
  page,
  totalPages,
  onPageChange,
}: DataTableProps<T>) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.key ?? `col-${index}`}
                  className={cn("px-4 py-3 font-medium", column.align === "right" && "text-right")}
                >
                  {column.key && onSortChange ? (
                    <SortableHeader label={column.header} field={column.key} sort={sort} onSortChange={onSortChange} />
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowId = getRowId(row);
              return (
                <tr
                  key={rowId}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  aria-selected={selectedRowId === rowId}
                  className={cn(
                    "border-b border-border last:border-0",
                    onRowClick && "cursor-pointer hover:bg-muted/50",
                    selectedRowId === rowId && "bg-muted/50"
                  )}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.key ?? `col-${index}`}
                      className={cn("px-4 py-3 text-foreground", column.align === "right" && "text-right tabular-nums")}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
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

function SortableHeader({
  label,
  field,
  sort,
  onSortChange,
}: {
  label: ReactNode;
  field: string;
  sort?: string;
  onSortChange: (sort: string) => void;
}) {
  const isActive = sort === field || sort === `-${field}`;
  const isDescending = sort === `-${field}`;
  const Icon = isActive ? (isDescending ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSortChange(isActive && !isDescending ? `-${field}` : field)}
      className={cn("inline-flex items-center gap-1 font-medium hover:text-foreground", isActive && "text-foreground")}
    >
      {label}
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
