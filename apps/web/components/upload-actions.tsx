"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@hpp/ui";
import { uploadsApi } from "../lib/uploads-api";
import { ApiRequestError } from "../lib/api-client";

/** `["uploads"]` (no `exact`) invalidates the list, this batch's detail, and its validation result in one call — TanStack Query matches any query key that starts with the given prefix. */
function invalidateUploads(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["uploads"] });
}

/** docs/06_UPLOAD_ENGINE.md §2: warning-severity rows require an explicit acknowledgment checkbox before confirmation proceeds; error-severity rows block it entirely (the button is only rendered once `status === "validated"`, which already implies zero error rows). */
export function ConfirmAction({ batchId, hasWarnings }: { batchId: string; hasWarnings: boolean }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => uploadsApi.confirm(batchId, hasWarnings ? acknowledged : undefined),
    onSuccess: () => invalidateUploads(queryClient),
  });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {hasWarnings ? (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5"
          />
          <span>Saya sudah meninjau peringatan di atas dan tetap ingin melanjutkan.</span>
        </label>
      ) : null}

      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof ApiRequestError ? mutation.error.message : "Gagal mengonfirmasi upload."}
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          disabled={(hasWarnings && !acknowledged) || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Mengonfirmasi..." : "Konfirmasi Upload"}
        </Button>
      </div>
    </div>
  );
}

/** docs/01_BUSINESS_RULES.md §5: rollback marks every non-stale allocation run for the batch's period stale — the inline warning names that cascade before the destructive action fires, rather than a silent undo. */
export function RollbackAction({ batchId }: { batchId: string }) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => uploadsApi.rollback(batchId),
    onSuccess: () => {
      setConfirming(false);
      invalidateUploads(queryClient);
    },
  });

  if (!confirming) {
    return (
      <div className="border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
          Rollback
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p role="alert" className="text-sm text-destructive">
        Ini akan menghapus data yang sudah masuk ke tabel transaksi untuk batch ini, dan menandai semua allocation run
        periode ini sebagai usang (stale). Lanjutkan?
      </p>

      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof ApiRequestError ? mutation.error.message : "Gagal melakukan rollback."}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Memproses..." : "Ya, Rollback"}
        </Button>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setConfirming(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
