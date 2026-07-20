"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, ErrorState, LoadingSkeleton, ValidationResult } from "@hpp/ui";
import { uploadsApi, type UploadBatch } from "../lib/uploads-api";
import { useAuth } from "../lib/auth-context";
import { ConfirmAction, RollbackAction } from "./upload-actions";

const SETTLED_STATUSES: readonly UploadBatch["status"][] = ["validated", "failed", "confirmed", "rolled_back"];
const VALIDATION_PAGE_SIZE = 50;

function isSettled(status: UploadBatch["status"]): boolean {
  return SETTLED_STATUSES.includes(status);
}

/**
 * docs/06_UPLOAD_ENGINE.md §2: parsing/validation run async (BullMQ). The
 * frontend polls `GET /uploads/:id` rather than waiting on a push channel —
 * no notification/SSE backend exists yet, and docs/16_NOTIFICATION.md §2
 * explicitly allows polling as the MVP fallback. Polling stops once the
 * batch reaches a settled status (`isSettled`).
 */
export function UploadDetail({ batchId }: { batchId: string }) {
  const [validationPage, setValidationPage] = useState(1);
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("upload.write") ?? false;

  const batchQuery = useQuery({
    queryKey: ["uploads", "detail", batchId],
    queryFn: () => uploadsApi.get(batchId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !isSettled(status) ? 2000 : false;
    },
  });

  const batch = batchQuery.data;
  const showValidation = batch ? isSettled(batch.status) : false;

  const validationQuery = useQuery({
    queryKey: ["uploads", "validation", batchId, validationPage],
    queryFn: () => uploadsApi.getValidation(batchId, { page: validationPage, limit: VALIDATION_PAGE_SIZE }),
    enabled: showValidation,
  });

  if (batchQuery.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (batchQuery.isError || !batch) {
    return <ErrorState message="Gagal memuat detail upload." onRetry={() => void batchQuery.refetch()} />;
  }

  const totalPages = validationQuery.data
    ? Math.max(1, Math.ceil(validationQuery.data.meta.total / VALIDATION_PAGE_SIZE))
    : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{batch.fileName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!showValidation ? (
          <p className="text-sm text-muted-foreground">
            {batch.status === "staged" ? "Menunggu diproses..." : "Memvalidasi..."} Proses ini bisa memakan waktu
            beberapa menit untuk file besar.
          </p>
        ) : null}

        {showValidation && validationQuery.isError ? (
          <ErrorState message="Gagal memuat hasil validasi." onRetry={() => void validationQuery.refetch()} />
        ) : null}

        {showValidation && !validationQuery.isError ? (
          <ValidationResult
            summary={validationQuery.data?.summary ?? { totalRows: 0, validRows: 0, errorRows: 0, warningRows: 0 }}
            errors={validationQuery.data?.errors ?? []}
            page={validationPage}
            totalPages={totalPages}
            onPageChange={setValidationPage}
            loading={validationQuery.isLoading}
          />
        ) : null}

        {canWrite && batch.status === "validated" ? (
          <ConfirmAction batchId={batch.id} hasWarnings={(validationQuery.data?.summary.warningRows ?? 0) > 0} />
        ) : null}

        {canWrite && batch.status === "confirmed" ? <RollbackAction batchId={batch.id} /> : null}
      </CardContent>
    </Card>
  );
}
