"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, GuidedTooltip, LoadingSkeleton, MetricCard, PageHeader } from "@hpp/ui";
import { LayoutDashboard } from "lucide-react";
import { periodsApi } from "../lib/periods-api";
import { profitabilityApi } from "../lib/profitability-api";
import { allocationRunsApi } from "../lib/allocation-runs-api";
import { ApiRequestError } from "../lib/api-client";
import { formatCurrencyIDR, formatPercent, trendFromVariance } from "../lib/format";
import { ProfitCenterRanking } from "./profit-center-ranking";
import { ProfitabilityTrendChart } from "./profitability-trend-chart";

/**
 * docs/38_DASHBOARD_SPECIFICATION.md §1/§4, docs/39_EXECUTIVE_KPI.md §1: KPI
 * strip + profit-center ranking + revenue trend. Doctor variance summary, AI
 * insight panel, and allocation-run history are separate widgets those docs
 * describe but this backend doesn't expose the data for yet
 * (`ProfitabilitySummaryResponseDto` has no unallocated-cost, target-margin,
 * or doctor-flag counts) — not rendered rather than faked with placeholder
 * data. The trend chart is per-profit-center revenue (one line each),
 * not a single hospital-wide series — `GET /profitability/trends` only
 * takes one `profitCenterId` at a time; there's no hospital-wide trend
 * endpoint to draw a single aggregate line from.
 *
 * Period selection: defaults to the most recent period that actually has a
 * completed, non-stale allocation run (found via `GET /allocation-runs?
 * status=completed`, not by probing each period's summary endpoint) —
 * falls back to the most recent period overall if none has one yet, which
 * correctly surfaces the "Perhitungan belum dijalankan" empty state.
 */
export function ExecutiveDashboard() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: periodsApi.list });
  const periods = useMemo(
    () => [...(periodsQuery.data?.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [periodsQuery.data]
  );

  const completedRunsQuery = useQuery({
    queryKey: ["allocation-runs", "completed"],
    queryFn: () => allocationRunsApi.list({ status: "completed", limit: 100 }),
  });
  const periodIdsWithCompletedRun = useMemo(
    () => new Set((completedRunsQuery.data?.data ?? []).filter((run) => !run.isStale).map((run) => run.periodId)),
    [completedRunsQuery.data]
  );

  useEffect(() => {
    if (selectedPeriodId !== null || periods.length === 0 || completedRunsQuery.isLoading) return;
    const latestWithRun = periods.find((period) => periodIdsWithCompletedRun.has(period.id));
    setSelectedPeriodId((latestWithRun ?? periods[0]!).id);
  }, [periods, periodIdsWithCompletedRun, completedRunsQuery.isLoading, selectedPeriodId]);

  const summaryQuery = useQuery({
    queryKey: ["profitability-summary", selectedPeriodId],
    queryFn: () => profitabilityApi.summary(selectedPeriodId!),
    enabled: selectedPeriodId !== null,
  });

  const noCompletedRun =
    summaryQuery.error instanceof ApiRequestError &&
    summaryQuery.error.status === 404 &&
    summaryQuery.error.code === "NO_COMPLETED_ALLOCATION_RUN";

  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        description="Hospital-wide KPIs, profitability trends, and AI insights."
        action={<GuidedTooltip content="Ringkasan performa finansial rumah sakit — lihat docs/39_EXECUTIVE_KPI.md." />}
      />

      {periodsQuery.isLoading ? <LoadingSkeleton /> : null}

      {periodsQuery.isError ? (
        <ErrorState
          message="Gagal memuat daftar periode."
          onRetry={() => void periodsQuery.refetch()}
        />
      ) : null}

      {periodsQuery.isSuccess && periods.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Belum ada periode"
          description="Periode fiskal belum dibuat untuk rumah sakit ini."
        />
      ) : null}

      {periodsQuery.isSuccess && periods.length > 0 ? (
        <div className="flex flex-col gap-6">
          <label className="flex w-fit flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Periode</span>
            <select
              value={selectedPeriodId ?? ""}
              onChange={(event) => setSelectedPeriodId(event.target.value)}
              className="h-10 rounded-sm border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>

          {summaryQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Pendapatan" value="" loading />
              <MetricCard label="Total Biaya" value="" loading />
              <MetricCard label="Laba Kotor" value="" loading />
              <MetricCard label="Margin Keseluruhan" value="" loading />
            </div>
          ) : null}

          {summaryQuery.isError && noCompletedRun ? (
            <EmptyState
              icon={LayoutDashboard}
              title="Perhitungan belum dijalankan"
              description="Jalankan Cost Allocation untuk melihat unit cost, profit, dan margin."
            />
          ) : null}

          {summaryQuery.isError && !noCompletedRun ? (
            <ErrorState
              message="Gagal memuat ringkasan profitabilitas."
              onRetry={() => void summaryQuery.refetch()}
            />
          ) : null}

          {summaryQuery.isSuccess ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Total Pendapatan"
                  value={formatCurrencyIDR(summaryQuery.data.totalRevenue)}
                  trend={trendFromVariance(summaryQuery.data.totalRevenueVariance, formatCurrencyIDR) ?? undefined}
                />
                <MetricCard
                  label="Total Biaya"
                  value={formatCurrencyIDR(summaryQuery.data.totalCost)}
                  trend={trendFromVariance(summaryQuery.data.totalCostVariance, formatCurrencyIDR) ?? undefined}
                />
                <MetricCard
                  label="Laba Kotor"
                  value={formatCurrencyIDR(summaryQuery.data.totalGrossProfit)}
                  trend={trendFromVariance(summaryQuery.data.totalGrossProfitVariance, formatCurrencyIDR) ?? undefined}
                />
                <MetricCard
                  label="Margin Keseluruhan"
                  value={summaryQuery.data.overallMargin !== null ? formatPercent(summaryQuery.data.overallMargin) : "—"}
                  trend={trendFromVariance(summaryQuery.data.overallMarginVariance, (v) => formatPercent(v)) ?? undefined}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ProfitCenterRanking periodId={selectedPeriodId!} />
                <ProfitabilityTrendChart periodId={selectedPeriodId!} />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
