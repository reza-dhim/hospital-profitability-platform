"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, DataTable, EmptyState, ErrorState, GuidedTooltip, LoadingSkeleton, type DataTableColumn } from "@hpp/ui";
import { Stethoscope } from "lucide-react";
import { profitabilityApi, type ServiceUnitCostRow } from "../lib/profitability-api";
import { formatCurrencyIDR, formatPercent, trendFromVariance } from "../lib/format";
import { ApiRequestError } from "../lib/api-client";

const SORT_GETTERS: Record<string, (row: ServiceUnitCostRow) => number | string | null> = {
  code: (row) => row.serviceCode,
  name: (row) => row.serviceName,
  serviceAllocatedCost: (row) => Number(row.serviceAllocatedCost),
  serviceVolume: (row) => Number(row.serviceVolume),
  unitCost: (row) => (row.unitCost === null ? null : Number(row.unitCost)),
  currentTariff: (row) => (row.currentTariff === null ? null : Number(row.currentTariff)),
  tariffGap: (row) => (row.tariffGap === null ? null : Number(row.tariffGap)),
};

function sortRows(rows: ServiceUnitCostRow[], sort: string): ServiceUnitCostRow[] {
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

function moneyOrDash(value: string | null): string {
  return value === null ? "—" : formatCurrencyIDR(value);
}

function tariffGapCell(gap: string | null) {
  if (gap === null) return "—";
  const numeric = Number(gap);
  return (
    <span className={numeric < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
      {formatCurrencyIDR(gap)}
    </span>
  );
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

/**
 * docs/10_UNIT_COST_ENGINE.md — per-service unit cost, tariff gap, and
 * recommended tariff. "Tarif Rekomendasi" here is always the
 * formula-calculated value (`unit_cost / (1 − target_margin)`) — §4
 * explicitly requires this stay visually distinct from any future
 * AI-suggested tariff, hence the "(Kalkulasi)" suffix and tooltip rather
 * than a bare "Tarif Rekomendasi" label that could later be confused with one.
 */
export function ServiceUnitCostTable({ periodId }: { periodId: string }) {
  const [sort, setSort] = useState("name");
  const query = useQuery({
    queryKey: ["profitability-services", periodId],
    queryFn: () => profitabilityApi.services(periodId),
  });
  const profitCentersQuery = useQuery({
    // Same key `ProfitCenterDetailTable`/`ProfitCenterRanking` use — shares the cached result.
    queryKey: ["profitability-profit-centers", periodId],
    queryFn: () => profitabilityApi.profitCenters(periodId),
  });
  const profitCenterNameById = useMemo(
    () => new Map((profitCentersQuery.data?.data ?? []).map((pc) => [pc.profitCenterId, pc.profitCenterName])),
    [profitCentersQuery.data]
  );

  const rows = useMemo(() => sortRows(query.data?.data ?? [], sort), [query.data, sort]);

  const noCompletedRun =
    query.error instanceof ApiRequestError && query.error.status === 404 && query.error.code === "NO_COMPLETED_ALLOCATION_RUN";

  const columns: DataTableColumn<ServiceUnitCostRow>[] = [
    { key: "code", header: "Kode", render: (row) => row.serviceCode },
    { key: "name", header: "Layanan", render: (row) => row.serviceName },
    { header: "Profit Center", render: (row) => profitCenterNameById.get(row.profitCenterId) ?? "—" },
    { key: "serviceAllocatedCost", header: "Biaya Alokasi", align: "right", render: (row) => formatCurrencyIDR(row.serviceAllocatedCost) },
    { key: "serviceVolume", header: "Volume", align: "right", render: (row) => row.serviceVolume },
    { key: "unitCost", header: "Unit Cost", align: "right", render: (row) => moneyOrDash(row.unitCost) },
    { key: "currentTariff", header: "Tarif Saat Ini", align: "right", render: (row) => moneyOrDash(row.currentTariff) },
    { key: "tariffGap", header: "Selisih Tarif", align: "right", render: (row) => tariffGapCell(row.tariffGap) },
    { header: "Variance Unit Cost", align: "right", render: (row) => varianceCell(row.unitCostVariance) },
    { header: "Target Margin", align: "right", render: (row) => formatPercent(row.targetMarginUsed) },
    {
      // Not sortable: the tooltip below renders its own `<button>`, and
      // `DataTable` wraps sortable headers in a `<button>` too — nesting
      // interactive elements would be invalid HTML.
      header: (
        <span className="inline-flex items-center gap-1">
          Tarif Rekomendasi (Kalkulasi)
          <GuidedTooltip content="Dihitung dari unit cost dan target margin — bukan rekomendasi AI." />
        </span>
      ),
      align: "right",
      render: (row) => moneyOrDash(row.recommendedTariff),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detail Unit Cost Layanan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(query.isLoading || profitCentersQuery.isLoading) ? <LoadingSkeleton /> : null}

        {query.isError && noCompletedRun ? (
          <EmptyState icon={Stethoscope} title="Perhitungan belum dijalankan" description="Jalankan Cost Allocation untuk melihat unit cost dan tarif layanan." />
        ) : null}

        {query.isError && !noCompletedRun ? (
          <ErrorState message="Gagal memuat detail unit cost layanan." onRetry={() => void query.refetch()} />
        ) : null}

        {query.isSuccess && rows.length === 0 ? (
          <EmptyState icon={Stethoscope} title="Belum ada data layanan" description="Tambahkan layanan di Master Data untuk melihat unit cost dan tarifnya." />
        ) : null}

        {query.isSuccess && rows.length > 0 ? (
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(row) => row.serviceId}
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
