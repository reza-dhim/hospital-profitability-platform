"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@hpp/ui";
import { UploadCloud } from "lucide-react";
import { uploadsApi, type UploadBatch } from "../lib/uploads-api";
import { periodsApi } from "../lib/periods-api";
import { formatDateTime } from "../lib/format";
import { useAuth } from "../lib/auth-context";
import { NewUploadForm } from "./new-upload-form";
import { UploadDetail } from "./upload-detail";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<UploadBatch["status"], string> = {
  staged: "Menunggu Parsing",
  validating: "Memvalidasi",
  validated: "Siap Dikonfirmasi",
  confirmed: "Terkonfirmasi",
  rolled_back: "Dibatalkan",
  failed: "Gagal",
};

/** Reuses the semantic color scale (docs/36_DESIGN_PRINCIPLES.md §2) — no ad hoc colors per status. */
const STATUS_TONE: Record<UploadBatch["status"], string> = {
  staged: "bg-muted text-muted-foreground",
  validating: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  validated: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  rolled_back: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

const TYPE_LABEL: Record<string, string> = {
  cost: "Biaya",
  revenue: "Pendapatan",
  driver: "Driver Alokasi",
};

function StatusBadge({ status }: { status: UploadBatch["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * docs/06_UPLOAD_ENGINE.md §2/§6: history list (sub-task 0) + intake (this
 * sub-task — template download, dropzone, `POST /uploads/:type`). Async
 * validation-result display and confirm/rollback are later sub-tasks that
 * extend this same component in place — same incremental pattern as
 * `ExecutiveDashboard`. "New Upload" is gated on `upload.write`, matching
 * `docs/04_RBAC.md` §2 (only Tim Costing/System Admin can write uploads —
 * CFO and others are read-only).
 */
export function UploadCenter() {
  const [page, setPage] = useState(1);
  const [showNewUpload, setShowNewUpload] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const { user } = useAuth();
  const canUpload = user?.permissions.includes("upload.write") ?? false;
  const queryClient = useQueryClient();

  const uploadsQuery = useQuery({
    queryKey: ["uploads", page],
    queryFn: () => uploadsApi.list({ page, limit: PAGE_SIZE }),
  });
  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: periodsApi.list });
  const periodLabelById = useMemo(
    () => new Map((periodsQuery.data?.data ?? []).map((period) => [period.id, period.label])),
    [periodsQuery.data]
  );

  const batches = uploadsQuery.data?.data ?? [];
  const totalPages = uploadsQuery.data ? Math.max(1, Math.ceil(uploadsQuery.data.meta.total / PAGE_SIZE)) : 1;
  // The empty state below shows its own primary CTA — suppress this one then
  // so there's never two primary-styled buttons on screen at once (docs/36_DESIGN_PRINCIPLES.md §1 "CTA jelas").
  const showEmptyState = uploadsQuery.isSuccess && batches.length === 0 && !showNewUpload;

  return (
    <>
      <PageHeader
        title="Upload Center"
        description="Download templates and bulk upload cost, revenue, and activity data."
        action={
          canUpload && !showEmptyState ? (
            <Button
              type="button"
              variant={showNewUpload ? "outline" : "primary"}
              onClick={() => {
                setShowNewUpload((v) => !v);
                setSelectedBatchId(null);
              }}
            >
              {showNewUpload ? "Tutup" : "Upload Baru"}
            </Button>
          ) : undefined
        }
      />

      {canUpload && showNewUpload ? (
        <div className="mb-6">
          <NewUploadForm
            onCreated={() => {
              setShowNewUpload(false);
              setPage(1);
              void queryClient.invalidateQueries({ queryKey: ["uploads"] });
            }}
          />
        </div>
      ) : null}

      {uploadsQuery.isLoading ? <LoadingSkeleton /> : null}

      {uploadsQuery.isError ? (
        <ErrorState message="Gagal memuat riwayat upload." onRetry={() => void uploadsQuery.refetch()} />
      ) : null}

      {showEmptyState ? (
        <EmptyState
          icon={UploadCloud}
          title="Belum ada data biaya"
          description="Upload data biaya menggunakan template standar agar sistem dapat menghitung costing."
          action={
            canUpload ? (
              <Button type="button" onClick={() => setShowNewUpload(true)}>
                Upload Baru
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {uploadsQuery.isSuccess && batches.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Berkas</th>
                  <th className="px-4 py-3 font-medium">Tipe</th>
                  <th className="px-4 py-3 font-medium">Periode</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Baris</th>
                  <th className="px-4 py-3 text-right font-medium">Error</th>
                  <th className="px-4 py-3 font-medium">Diunggah</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    onClick={() => {
                      setSelectedBatchId((current) => (current === batch.id ? null : batch.id));
                      setShowNewUpload(false);
                    }}
                    aria-selected={selectedBatchId === batch.id}
                    className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${selectedBatchId === batch.id ? "bg-muted/50" : ""}`}
                  >
                    <td className="px-4 py-3 text-foreground">{batch.fileName}</td>
                    <td className="px-4 py-3">{TYPE_LABEL[batch.type] ?? batch.type}</td>
                    <td className="px-4 py-3">{periodLabelById.get(batch.periodId) ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={batch.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{batch.rowCount ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{batch.errorCount ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(batch.createdAt)}</td>
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

          {selectedBatchId ? <UploadDetail batchId={selectedBatchId} /> : null}
        </div>
      ) : null}
    </>
  );
}
