"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, DataTable, EmptyState, ErrorState, LoadingSkeleton, type DataTableColumn } from "@hpp/ui";
import { Stethoscope } from "lucide-react";
import { doctorAnalyticsApi, type DoctorAnalyticsSummaryRow } from "../lib/doctor-analytics-api";
import { formatCurrencyIDR, formatPercent } from "../lib/format";
import { ApiRequestError } from "../lib/api-client";
import { DoctorComparisonPanel } from "./doctor-comparison-panel";

/**
 * docs/11_DOCTOR_ANALYTICS.md §2-§3 — service-grain summary, always
 * de-identified by construction (the API never returns a doctor id/name at
 * this grain, see `DoctorAnalyticsSummaryRowDto`). Selecting a row drills
 * into `DoctorComparisonPanel`, which is the one place doctor-identified
 * data can appear, gated server-side.
 */
export function DoctorAnalyticsSummaryTable({ periodId }: { periodId: string }) {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["doctor-analytics-summary", periodId],
    queryFn: () => doctorAnalyticsApi.summary(periodId),
  });
  const rows = query.data?.data ?? [];
  const selectedRow = rows.find((row) => row.serviceId === selectedServiceId) ?? null;

  const noCompletedRun =
    query.error instanceof ApiRequestError && query.error.status === 404 && query.error.code === "NO_COMPLETED_ALLOCATION_RUN";

  const columns: DataTableColumn<DoctorAnalyticsSummaryRow>[] = [
    { header: "Layanan", render: (row) => `${row.serviceCode} — ${row.serviceName}` },
    { header: "Jumlah Dokter", align: "right", render: (row) => row.doctorCount },
    { header: "Total Pendapatan", align: "right", render: (row) => formatCurrencyIDR(row.totalRevenue) },
    { header: "Total Biaya", align: "right", render: (row) => formatCurrencyIDR(row.totalCost) },
    { header: "Total Profit", align: "right", render: (row) => formatCurrencyIDR(row.totalProfit) },
    { header: "Margin", align: "right", render: (row) => (row.overallMargin === null ? "—" : formatPercent(row.overallMargin)) },
    { header: "Di atas P90", align: "right", render: (row) => row.doctorsAboveP90Count },
    { header: "Di bawah P25", align: "right", render: (row) => row.doctorsBelowP25Count },
    {
      header: "Aksi",
      render: (row) => (
        <button
          type="button"
          onClick={() => setSelectedServiceId(row.serviceId === selectedServiceId ? null : row.serviceId)}
          className="text-sm text-primary underline underline-offset-2"
        >
          {row.serviceId === selectedServiceId ? "Tutup" : "Lihat Detail"}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Performa Dokter per Layanan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {query.isLoading ? <LoadingSkeleton /> : null}

          {query.isError && noCompletedRun ? (
            <EmptyState icon={Stethoscope} title="Perhitungan belum dijalankan" description="Jalankan Cost Allocation untuk melihat performa dokter." />
          ) : null}

          {query.isError && !noCompletedRun ? (
            <ErrorState message="Gagal memuat ringkasan performa dokter." onRetry={() => void query.refetch()} />
          ) : null}

          {query.isSuccess && rows.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="Belum ada data aktivitas medis"
              description="Unggah data aktivitas medis di Upload Center untuk melihat performa dokter per layanan."
            />
          ) : null}

          {query.isSuccess && rows.length > 0 ? (
            <DataTable columns={columns} rows={rows} getRowId={(row) => row.serviceId} page={1} totalPages={1} onPageChange={() => {}} />
          ) : null}
        </CardContent>
      </Card>

      {selectedRow ? (
        <DoctorComparisonPanel serviceId={selectedRow.serviceId} serviceName={selectedRow.serviceName} periodId={periodId} />
      ) : null}
    </div>
  );
}
