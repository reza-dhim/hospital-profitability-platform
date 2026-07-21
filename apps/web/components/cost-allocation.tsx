"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@hpp/ui";
import { SplitSquareVertical } from "lucide-react";
import { allocationRunsApi, type AllocationRun } from "../lib/allocation-runs-api";
import { periodsApi } from "../lib/periods-api";
import { formatDateTime } from "../lib/format";
import { useAuth } from "../lib/auth-context";
import { NewAllocationRunForm } from "./new-allocation-run-form";
import { AllocationRunDetail } from "./allocation-run-detail";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<AllocationRun["status"], string> = {
  draft: "Draf",
  running: "Berjalan",
  completed: "Selesai",
  completed_with_errors: "Selesai dengan Peringatan",
  failed: "Gagal",
};

/** Reuses the semantic color scale (docs/36_DESIGN_PRINCIPLES.md §2) — no ad hoc colors per status. */
const STATUS_TONE: Record<AllocationRun["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  running: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  completed_with_errors: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  failed: "bg-destructive/10 text-destructive",
};

const METHOD_LABEL: Record<AllocationRun["method"], string> = {
  direct: "Direct",
  step_down: "Step-Down",
};

function StatusBadge({ status }: { status: AllocationRun["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}


/**
 * docs/08_COST_ALLOCATION_ENGINE.md §3: run history/landing view + trigger
 * (`POST /allocation-runs`, gated on `cost_allocation.write` per docs/04
 * §2) + row-click detail (`AllocationRunDetail` polls status, then shows
 * warnings and the allocated-costs table). Recalculate is a later
 * sub-task extending this same component in place — same incremental
 * pattern as `UploadCenter`.
 */
export function CostAllocation() {
  const [page, setPage] = useState(1);
  const [showNewRun, setShowNewRun] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { user } = useAuth();
  const canTrigger = user?.permissions.includes("cost_allocation.write") ?? false;
  const queryClient = useQueryClient();

  const runsQuery = useQuery({
    queryKey: ["allocation-runs", page],
    queryFn: () => allocationRunsApi.list({ page, limit: PAGE_SIZE }),
  });
  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: periodsApi.list });
  const periodLabelById = useMemo(
    () => new Map((periodsQuery.data?.data ?? []).map((period) => [period.id, period.label])),
    [periodsQuery.data]
  );

  const runs = runsQuery.data?.data ?? [];
  const totalPages = runsQuery.data ? Math.max(1, Math.ceil(runsQuery.data.meta.total / PAGE_SIZE)) : 1;
  // Same "exactly one primary CTA" rule as UploadCenter (docs/36_DESIGN_PRINCIPLES.md §1).
  const showEmptyState = runsQuery.isSuccess && runs.length === 0 && !showNewRun;

  return (
    <>
      <PageHeader
        title="Cost Allocation"
        description="Run and review Direct and Step-Down cost allocation."
        action={
          canTrigger && !showEmptyState ? (
            <Button type="button" variant={showNewRun ? "outline" : "primary"} onClick={() => setShowNewRun((v) => !v)}>
              {showNewRun ? "Tutup" : "Jalankan Alokasi"}
            </Button>
          ) : undefined
        }
      />

      {canTrigger && showNewRun ? (
        <div className="mb-6">
          <NewAllocationRunForm
            onCreated={() => {
              setShowNewRun(false);
              setPage(1);
              void queryClient.invalidateQueries({ queryKey: ["allocation-runs"] });
            }}
          />
        </div>
      ) : null}

      {runsQuery.isLoading ? <LoadingSkeleton /> : null}

      {runsQuery.isError ? (
        <ErrorState message="Gagal memuat riwayat alokasi." onRetry={() => void runsQuery.refetch()} />
      ) : null}

      {showEmptyState ? (
        <EmptyState
          icon={SplitSquareVertical}
          title="Perhitungan belum dijalankan"
          description="Jalankan Cost Allocation untuk mendistribusikan biaya cost center ke profit center."
          action={
            canTrigger ? (
              <Button type="button" onClick={() => setShowNewRun(true)}>
                Jalankan Alokasi
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {runsQuery.isSuccess && runs.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Periode</th>
                  <th className="px-4 py-3 font-medium">Metode</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Peringatan</th>
                  <th className="px-4 py-3 font-medium">Usang</th>
                  <th className="px-4 py-3 font-medium">Waktu Selesai</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => {
                      setSelectedRunId((current) => (current === run.id ? null : run.id));
                      setShowNewRun(false);
                    }}
                    aria-selected={selectedRunId === run.id}
                    className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${selectedRunId === run.id ? "bg-muted/50" : ""}`}
                  >
                    <td className="px-4 py-3 text-foreground">{periodLabelById.get(run.periodId) ?? "—"}</td>
                    <td className="px-4 py-3">{METHOD_LABEL[run.method]}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{(run.warnings ?? []).length}</td>
                    <td className="px-4 py-3">{run.isStale ? "Ya" : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {run.finishedAt ? formatDateTime(run.finishedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

          {selectedRunId ? (
            <AllocationRunDetail
              runId={selectedRunId}
              canWrite={canTrigger}
              onRecalculated={(newRunId) => {
                setPage(1);
                setSelectedRunId(newRunId);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
