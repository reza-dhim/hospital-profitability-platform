"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, GuidedTooltip, LoadingSkeleton, PageHeader } from "@hpp/ui";
import { LayoutDashboard } from "lucide-react";
import { periodsApi } from "../lib/periods-api";
import { allocationRunsApi } from "../lib/allocation-runs-api";
import { DoctorAnalyticsSummaryTable } from "./doctor-analytics-summary-table";

/**
 * docs/11_DOCTOR_ANALYTICS.md — period selection mirrors `Profitability`'s
 * fallback-to-latest-completed-run logic exactly (same small duplication
 * tradeoff that component's own doc comment explains).
 */
export function DoctorAnalytics() {
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

  return (
    <>
      <PageHeader
        title="Doctor Analytics"
        description="Variasi biaya dan performa per dokter dan layanan — raport manajemen, bukan alat menghukum."
        action={<GuidedTooltip content="Lihat docs/11_DOCTOR_ANALYTICS.md dan docs/PRODUCT_BIBLE.md §7. Detail per-dokter hanya tampil untuk peran dengan akses doctor_analytics.read_detail." />}
      />

      {periodsQuery.isLoading ? <LoadingSkeleton /> : null}

      {periodsQuery.isError ? (
        <ErrorState message="Gagal memuat daftar periode." onRetry={() => void periodsQuery.refetch()} />
      ) : null}

      {periodsQuery.isSuccess && periods.length === 0 ? (
        <EmptyState icon={LayoutDashboard} title="Belum ada periode" description="Periode fiskal belum dibuat untuk rumah sakit ini." />
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

          {selectedPeriodId !== null ? <DoctorAnalyticsSummaryTable periodId={selectedPeriodId} /> : null}
        </div>
      ) : null}
    </>
  );
}
