"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, DataTable, EmptyState, ErrorState, LoadingSkeleton, type DataTableColumn } from "@hpp/ui";
import { BarChart3 } from "lucide-react";
import { profitabilityApi, type ProfitCenterProfitabilityRow } from "../lib/profitability-api";
import { formatCurrencyIDR, formatPercent, trendFromVariance } from "../lib/format";
import { ApiRequestError } from "../lib/api-client";

const SORT_GETTERS: Record<string, (row: ProfitCenterProfitabilityRow) => number | string | null> = {
  code: (row) => row.profitCenterCode,
  name: (row) => row.profitCenterName,
  revenue: (row) => Number(row.revenue),
  directCost: (row) => Number(row.directCost),
  allocatedCost: (row) => Number(row.allocatedCost),
  totalCost: (row) => Number(row.totalCost),
  grossProfit: (row) => Number(row.grossProfit),
  margin: (row) => (row.margin === null ? null : Number(row.margin)),
};

function sortRows(rows: ProfitCenterProfitabilityRow[], sort: string): ProfitCenterProfitabilityRow[] {
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  const getValue = SORT_GETTERS[field];
  if (!getValue) return rows;
  return [...rows].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return descending ? -cmp : cmp;
  });
}

function varianceCell(variance: { absolute: string; percentage: string | null } | null) {
  const trend = trendFromVariance(variance, formatCurrencyIDR);
  if (!trend) return "—";
  return (
    <span className={trend.direction === "up" ? "text-emerald-600 dark:text-emerald-400" : trend.direction === "down" ? "text-destructive" : "text-muted-foreground"}>
      {trend.label}
    </span>
  );
}

const COLUMNS: DataTableColumn<ProfitCenterProfitabilityRow>[] = [
  { key: "code", header: "Kode", render: (row) => row.profitCenterCode },
  { key: "name", header: "Nama", render: (row) => row.profitCenterName },
  { key: "revenue", header: "Pendapatan", align: "right", render: (row) => formatCurrencyIDR(row.revenue) },
  { key: "directCost", header: "Biaya Langsung", align: "right", render: (row) => formatCurrencyIDR(row.directCost) },
  { key: "allocatedCost", header: "Biaya Alokasi", align: "right", render: (row) => formatCurrencyIDR(row.allocatedCost) },
  { key: "totalCost", header: "Total Biaya", align: "right", render: (row) => formatCurrencyIDR(row.totalCost) },
  { header: "Variance Biaya", align: "right", render: (row) => varianceCell(row.totalCostVariance) },
  { key: "grossProfit", header: "Laba Kotor", align: "right", render: (row) => formatCurrencyIDR(row.grossProfit) },
  { key: "margin", header: "Margin", align: "right", render: (row) => (row.margin === null ? "—" : formatPercent(row.margin)) },
];

/** docs/09_PROFITABILITY_ENGINE.md — per-profit-center detail, the deep-dive version of the dashboard's ranking chart. No server-side sort/pagination for this shape, so both are done client-side over the full (small) result set. */
export function ProfitCenterDetailTable({ periodId }: { periodId: string }) {
  const [sort, setSort] = useState("margin");
  const query = useQuery({
    // Same key `ProfitCenterRanking` (dashboard) uses — shares the cached
    // result instead of double-fetching when both are mounted.
    queryKey: ["profitability-profit-centers", periodId],
    queryFn: () => profitabilityApi.profitCenters(periodId),
  });

  const rows = useMemo(() => sortRows(query.data?.data ?? [], sort), [query.data, sort]);

  const noCompletedRun =
    query.error instanceof ApiRequestError && query.error.status === 404 && query.error.code === "NO_COMPLETED_ALLOCATION_RUN";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detail Profit Center</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {query.isLoading ? <LoadingSkeleton /> : null}

        {query.isError && noCompletedRun ? (
          <EmptyState icon={BarChart3} title="Perhitungan belum dijalankan" description="Jalankan Cost Allocation untuk melihat detail profit center." />
        ) : null}

        {query.isError && !noCompletedRun ? (
          <ErrorState message="Gagal memuat detail profit center." onRetry={() => void query.refetch()} />
        ) : null}

        {query.isSuccess && rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="Belum ada profit center" description="Data akan muncul setelah cost center dan profit center dikonfigurasi." />
        ) : null}

        {query.isSuccess && rows.length > 0 ? (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            getRowId={(row) => row.profitCenterId}
            sort={sort}
            onSortChange={setSort}
            page={1}
            totalPages={1}
            onPageChange={() => {}}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
