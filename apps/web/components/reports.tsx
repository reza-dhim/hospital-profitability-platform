"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  GuidedTooltip,
  LoadingSkeleton,
  PageHeader,
  Select,
  type DataTableColumn,
} from "@hpp/ui";
import { FileText } from "lucide-react";
import { periodsApi } from "../lib/periods-api";
import { reportsApi, type ReportExport, type ReportType } from "../lib/reports-api";
import { triggerBrowserDownload } from "../lib/download-file";
import { formatDateTime } from "../lib/format";
import { ApiRequestError } from "../lib/api-client";

const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  executive_summary: "Executive Summary (PDF)",
  profitability_detail: "Profitability Detail (Excel)",
  doctor_analytics: "Doctor Analytics (PDF)",
};

interface ReportCardConfig {
  reportType: ReportType;
  title: string;
  description: string;
  generate: (periodId: string, regenerate: boolean) => Promise<{ blob: Blob; fileName: string }>;
}

const REPORT_CARDS: ReportCardConfig[] = [
  {
    reportType: "executive_summary",
    title: "Executive Summary",
    description: "KPI hospital, tren pendapatan/biaya/margin, top/bottom 5 profit center. Format PDF.",
    generate: (periodId, regenerate) => reportsApi.executivePdf({ periodId, regenerate }),
  },
  {
    reportType: "profitability_detail",
    title: "Profitability Detail",
    description: "Rincian per profit center dan per layanan, plus sheet data mentah. Format Excel.",
    generate: (periodId, regenerate) => reportsApi.profitabilityExcel({ periodId, regenerate }),
  },
  {
    reportType: "doctor_analytics",
    title: "Doctor Analytics",
    description: "Perbandingan kohort per layanan; rincian per dokter hanya untuk peran dengan akses doctor_analytics.read_detail. Format PDF.",
    generate: (periodId, regenerate) => reportsApi.doctorAnalyticsPdf({ periodId, regenerate }),
  },
];

function ReportCard({ periodId, config, onGenerated }: { periodId: string | null; config: ReportCardConfig; onGenerated: () => void }) {
  const mutation = useMutation({
    mutationFn: (regenerate: boolean) => config.generate(periodId!, regenerate),
    onSuccess: (file) => {
      triggerBrowserDownload(file.blob, file.fileName);
      onGenerated();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error instanceof ApiRequestError ? mutation.error.message : "Gagal membuat laporan."}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" disabled={!periodId || mutation.isPending} onClick={() => mutation.mutate(false)}>
            {mutation.isPending ? "Menyiapkan..." : "Buat / Unduh"}
          </Button>
          <Button type="button" variant="outline" disabled={!periodId || mutation.isPending} onClick={() => mutation.mutate(true)}>
            Buat Ulang
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * docs/15_REPORTING.md — on-demand generation for the 3 MVP report types.
 * "Buat / Unduh" reuses the latest existing export for this (type, period)
 * if one exists (§2: "not regenerated in place"); "Buat Ulang" forces a
 * fresh generation against the current data. Scheduling (recurring
 * generation + email delivery) is out of scope — no SMTP/email provider
 * exists yet.
 */
export function Reports() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: periodsApi.list });
  const periods = [...(periodsQuery.data?.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate));

  const exportsQuery = useQuery({
    queryKey: ["report-exports", selectedPeriodId],
    queryFn: () => reportsApi.listExports(selectedPeriodId ?? undefined),
    enabled: selectedPeriodId !== null,
  });

  const columns: DataTableColumn<ReportExport>[] = [
    { header: "Jenis Laporan", render: (row) => REPORT_TYPE_LABEL[row.reportType] },
    { header: "Dibuat pada", render: (row) => formatDateTime(row.generatedAt) },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Executive, profitability, dan doctor analytics — PDF dan Excel."
        action={<GuidedTooltip content="Setiap laporan terikat pada allocation run tertentu dan tersimpan permanen — lihat docs/15_REPORTING.md." />}
      />

      <div className="flex flex-col gap-6">
        {periodsQuery.isLoading ? <LoadingSkeleton /> : null}
        {periodsQuery.isError ? <ErrorState message="Gagal memuat daftar periode." onRetry={() => void periodsQuery.refetch()} /> : null}

        {periodsQuery.isSuccess ? (
          <label className="flex w-fit flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Periode</span>
            <Select value={selectedPeriodId ?? ""} onChange={(event) => setSelectedPeriodId(event.target.value || null)}>
              <option value="">Pilih periode</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {REPORT_CARDS.map((config) => (
            <ReportCard key={config.reportType} periodId={selectedPeriodId} config={config} onGenerated={() => void exportsQuery.refetch()} />
          ))}
        </div>

        {selectedPeriodId ? (
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Laporan</CardTitle>
            </CardHeader>
            <CardContent>
              {exportsQuery.isLoading ? <LoadingSkeleton /> : null}
              {exportsQuery.isError ? (
                <ErrorState message="Gagal memuat riwayat laporan." onRetry={() => void exportsQuery.refetch()} />
              ) : null}
              {exportsQuery.isSuccess && exportsQuery.data.data.length === 0 ? (
                <EmptyState icon={FileText} title="Belum ada laporan" description="Laporan untuk periode ini belum pernah dibuat." />
              ) : null}
              {exportsQuery.isSuccess && exportsQuery.data.data.length > 0 ? (
                <DataTable
                  columns={columns}
                  rows={exportsQuery.data.data}
                  getRowId={(row) => row.id}
                  page={1}
                  totalPages={1}
                  onPageChange={() => {}}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
