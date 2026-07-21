"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@hpp/ui";
import { allocationRunsApi, type AllocationMethod } from "../lib/allocation-runs-api";
import { periodsApi } from "../lib/periods-api";
import { ApiRequestError } from "../lib/api-client";

const METHOD_OPTIONS: { value: AllocationMethod; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "step_down", label: "Step-Down" },
];

const SELECT_CLASS =
  "h-10 rounded-sm border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * docs/08_COST_ALLOCATION_ENGINE.md §3: `POST /allocation-runs` creates a
 * `draft` run and enqueues the async job — status is picked up by polling in
 * `CostAllocation`, not here. Period options limited to `open` periods since
 * the endpoint 422s otherwise (same constraint as upload intake).
 */
export function NewAllocationRunForm({ onCreated }: { onCreated: () => void }) {
  const [periodId, setPeriodId] = useState("");
  const [method, setMethod] = useState<AllocationMethod>("step_down");

  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: periodsApi.list });
  const openPeriods = (periodsQuery.data?.data ?? []).filter((period) => period.status === "open");

  const createMutation = useMutation({
    mutationFn: () => allocationRunsApi.create(periodId, method),
    onSuccess: () => {
      setPeriodId("");
      onCreated();
    },
  });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Periode</span>
          <select value={periodId} onChange={(event) => setPeriodId(event.target.value)} className={SELECT_CLASS}>
            <option value="">Pilih periode terbuka</option>
            {openPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Metode</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as AllocationMethod)}
            className={SELECT_CLASS}
          >
            {METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {createMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {createMutation.error instanceof ApiRequestError
            ? createMutation.error.message
            : "Gagal menjalankan alokasi. Coba lagi."}
        </p>
      ) : null}

      <div>
        <Button type="button" disabled={!periodId || createMutation.isPending} onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? "Menjalankan..." : "Jalankan"}
        </Button>
      </div>
    </div>
  );
}
