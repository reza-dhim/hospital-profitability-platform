"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, UploadDropzone } from "@hpp/ui";
import { uploadsApi, type SupportedUploadType } from "../lib/uploads-api";
import { periodsApi } from "../lib/periods-api";
import { templatesApi } from "../lib/templates-api";
import { triggerBrowserDownload } from "../lib/download-file";
import { ApiRequestError } from "../lib/api-client";

const UPLOAD_TYPE_OPTIONS: { value: SupportedUploadType; label: string }[] = [
  { value: "cost", label: "Biaya" },
  { value: "revenue", label: "Pendapatan" },
  { value: "driver", label: "Driver Alokasi" },
  { value: "asset", label: "Aset" },
  { value: "employee", label: "Pegawai" },
  { value: "bmhp", label: "BMHP" },
  { value: "tariff", label: "Tarif" },
];

const SELECT_CLASS =
  "h-10 rounded-sm border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * docs/06_UPLOAD_ENGINE.md §2 steps 1-2: template download + `POST /uploads/:type`.
 * Offers every type the backend implements (`SUPPORTED_UPLOAD_TYPES`) —
 * `medical_activity` is the only `UploadType` not yet supported (no backing
 * table). Period options are limited to `open` periods since intake 422s
 * otherwise (`CreateUploadDto` doc comment).
 */
export function NewUploadForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<SupportedUploadType>("cost");
  const [periodId, setPeriodId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: periodsApi.list });
  const openPeriods = (periodsQuery.data?.data ?? []).filter((period) => period.status === "open");

  const downloadMutation = useMutation({
    mutationFn: () => templatesApi.download(type),
    onSuccess: ({ blob, fileName }) => triggerBrowserDownload(blob, fileName),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Pilih file terlebih dahulu.");
      return uploadsApi.create(type, periodId, file);
    },
    onSuccess: () => {
      setFile(null);
      onCreated();
    },
  });

  const selectedTypeLabel = UPLOAD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Tipe Data</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as SupportedUploadType)}
            className={SELECT_CLASS}
          >
            {UPLOAD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
      </div>

      <UploadDropzone
        onFileSelected={setFile}
        selectedFileName={file?.name}
        disabled={createMutation.isPending}
        templateLink={
          <button
            type="button"
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
            className="text-sm text-primary underline underline-offset-2 disabled:opacity-50"
          >
            {downloadMutation.isPending ? "Menyiapkan template..." : `Download template ${selectedTypeLabel}`}
          </button>
        }
      />

      {downloadMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Gagal mengunduh template. Coba lagi.
        </p>
      ) : null}

      {createMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {createMutation.error instanceof ApiRequestError
            ? createMutation.error.message
            : "Gagal mengunggah file. Coba lagi."}
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          disabled={!periodId || !file || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? "Mengunggah..." : "Unggah"}
        </Button>
      </div>
    </div>
  );
}
