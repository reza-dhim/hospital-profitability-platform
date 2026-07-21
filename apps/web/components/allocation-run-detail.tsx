"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorState, LoadingSkeleton } from "@hpp/ui";
import { AlertCircle } from "lucide-react";
import { allocationRunsApi, type AllocationRun, type AllocationRunWarning } from "../lib/allocation-runs-api";
import { costCentersApi } from "../lib/cost-centers-api";
import { profitCentersApi } from "../lib/profit-centers-api";
import { driversApi } from "../lib/drivers-api";
import { formatCurrencyIDR } from "../lib/format";
import { ApiRequestError } from "../lib/api-client";

const ALLOCATED_COSTS_PAGE_SIZE = 50;
const SETTLED_STATUSES: readonly AllocationRun["status"][] = ["completed", "completed_with_errors", "failed"];

function isSettled(status: AllocationRun["status"]): boolean {
  return SETTLED_STATUSES.includes(status);
}

function warningLabel(warning: AllocationRunWarning): string {
  if (warning.code === "W_DRIVER_ZERO") {
    return "Nilai driver nol untuk salah satu cost center — biaya dibagi rata (docs/08 §5).";
  }
  return warning.code;
}

/**
 * docs/08_COST_ALLOCATION_ENGINE.md §3: allocation runs process async
 * (BullMQ), so this polls `GET /allocation-runs/:id` the same way
 * `UploadDetail` polls upload batches — no push/SSE channel exists.
 * Once settled, shows any non-fatal warnings (never silently dropped,
 * docs/08 §5) plus the flat paginated allocated-costs table.
 *
 * "Hitung Ulang" (recalculate) is additive — it creates a *new* run with
 * `supersedesRunId` pointing back at this one and never mutates or deletes
 * it, so unlike Upload's Rollback it needs no destructive confirmation
 * step (docs/08 §4). Valid on any settled run, including `failed`.
 */
export function AllocationRunDetail({
  runId,
  canWrite,
  onRecalculated,
}: {
  runId: string;
  canWrite: boolean;
  onRecalculated: (newRunId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const recalculateMutation = useMutation({
    mutationFn: () => allocationRunsApi.recalculate(runId),
    onSuccess: (newRun) => {
      void queryClient.invalidateQueries({ queryKey: ["allocation-runs"] });
      onRecalculated(newRun.id);
    },
  });

  const runQuery = useQuery({
    queryKey: ["allocation-runs", "detail", runId],
    queryFn: () => allocationRunsApi.get(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !isSettled(status) ? 2000 : false;
    },
  });

  const run = runQuery.data;
  const showCosts = run ? isSettled(run.status) && run.status !== "failed" : false;

  const costsQuery = useQuery({
    queryKey: ["allocation-runs", "allocated-costs", runId, page],
    queryFn: () => allocationRunsApi.getAllocatedCosts(runId, { page, limit: ALLOCATED_COSTS_PAGE_SIZE }),
    enabled: showCosts,
  });

  const costCentersQuery = useQuery({ queryKey: ["cost-centers"], queryFn: costCentersApi.list, enabled: showCosts });
  const profitCentersQuery = useQuery({ queryKey: ["profit-centers"], queryFn: profitCentersApi.list, enabled: showCosts });
  const driversQuery = useQuery({ queryKey: ["drivers"], queryFn: driversApi.list, enabled: showCosts });

  const costCenterNameById = useMemo(
    () => new Map((costCentersQuery.data?.data ?? []).map((cc) => [cc.id, `${cc.code} — ${cc.name}`])),
    [costCentersQuery.data]
  );
  const profitCenterNameById = useMemo(
    () => new Map((profitCentersQuery.data?.data ?? []).map((pc) => [pc.id, `${pc.code} — ${pc.name}`])),
    [profitCentersQuery.data]
  );
  const driverNameById = useMemo(
    () => new Map((driversQuery.data?.data ?? []).map((driver) => [driver.id, driver.name])),
    [driversQuery.data]
  );

  if (runQuery.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (runQuery.isError || !run) {
    return <ErrorState message="Gagal memuat detail alokasi." onRetry={() => void runQuery.refetch()} />;
  }

  const costs = costsQuery.data?.data ?? [];
  const totalPages = costsQuery.data ? Math.max(1, Math.ceil(costsQuery.data.meta.total / ALLOCATED_COSTS_PAGE_SIZE)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detail Perhitungan Alokasi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!isSettled(run.status) ? (
          <p className="text-sm text-muted-foreground">
            {run.status === "draft" ? "Menunggu diproses..." : "Menghitung alokasi..."} Proses ini bisa memakan waktu
            beberapa menit.
          </p>
        ) : null}

        {run.status === "failed" ? (
          <p role="alert" className="text-sm text-destructive">
            {run.errorMessage ?? "Perhitungan alokasi gagal."}
          </p>
        ) : null}

        {run.warnings && run.warnings.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            {run.warnings.map((warning, index) => (
              <span key={`${warning.code}-${warning.costCenterId}-${index}`} className="inline-flex items-start gap-1.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {warningLabel(warning)}
              </span>
            ))}
          </div>
        ) : null}

        {showCosts && costsQuery.isError ? (
          <ErrorState message="Gagal memuat rincian biaya teralokasi." onRetry={() => void costsQuery.refetch()} />
        ) : null}

        {showCosts && costsQuery.isLoading ? <LoadingSkeleton /> : null}

        {showCosts && costsQuery.isSuccess ? (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cost Center Sumber</th>
                    <th className="px-4 py-3 font-medium">Tujuan</th>
                    <th className="px-4 py-3 font-medium">Driver</th>
                    <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((cost) => (
                    <tr key={cost.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-foreground">
                        {costCenterNameById.get(cost.sourceCostCenterId) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {cost.targetProfitCenterId
                          ? (profitCenterNameById.get(cost.targetProfitCenterId) ?? "—")
                          : (costCenterNameById.get(cost.targetCostCenterId ?? "") ?? "—")}
                      </td>
                      <td className="px-4 py-3">{driverNameById.get(cost.driverId) ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrencyIDR(cost.amount)}</td>
                    </tr>
                  ))}
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
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-sm border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-sm border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {canWrite && isSettled(run.status) ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {recalculateMutation.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {recalculateMutation.error instanceof ApiRequestError
                  ? recalculateMutation.error.message
                  : "Gagal menjalankan ulang alokasi."}
              </p>
            ) : null}
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={recalculateMutation.isPending}
                onClick={() => recalculateMutation.mutate()}
              >
                {recalculateMutation.isPending ? "Menghitung ulang..." : "Hitung Ulang"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
