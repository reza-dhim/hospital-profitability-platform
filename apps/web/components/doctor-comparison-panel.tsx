"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, GuidedTooltip, LoadingSkeleton, Select } from "@hpp/ui";
import { UserRound } from "lucide-react";
import { doctorAnalyticsApi, isIdentifiedComparison, type ComparisonFactor, type DoctorComparisonAggregate } from "../lib/doctor-analytics-api";
import { doctorMasterDataApi } from "../lib/doctors-api";
import { formatCurrencyIDR } from "../lib/format";
import { ApiRequestError } from "../lib/api-client";

const FACTOR_LABELS: Record<string, string> = {
  bmhp_cost: "Biaya BMHP",
  duration_minutes: "Durasi (menit)",
  room_cost: "Biaya Ruang",
  staff_cost: "Biaya Staf/Anestesi",
};

const BAND_LABELS: Record<string, string> = {
  below_p25: "Di bawah P25",
  p25_p75: "P25–P75",
  p75_p90: "P75–P90",
  above_p90: "Di atas P90",
};

function factorValue(factor: ComparisonFactor, key: "doctorAvg" | "cohortMedian"): string {
  const value = factor[key];
  if (value === null) return "—";
  return factor.factor === "duration_minutes" ? `${value} menit` : formatCurrencyIDR(value);
}

/**
 * docs/11_DOCTOR_ANALYTICS.md §4-§5 — renders whichever shape the API
 * actually returned (`isIdentifiedComparison`), never a client-side
 * permission check. `01_BUSINESS_RULES.md` §7's fairness rule is enforced
 * here structurally: every variance figure (percentile band or per-doctor
 * delta) always renders alongside its contributing factors — there is no
 * code path that shows a bare number.
 */
export function DoctorComparisonPanel({ serviceId, serviceName, periodId }: { serviceId: string; serviceName: string; periodId: string }) {
  const [selectedDoctorId, setSelectedDoctorId] = useState("");

  const doctorsQuery = useQuery({ queryKey: ["doctors", "master-data"], queryFn: () => doctorMasterDataApi.list({ limit: 100 }) });
  const doctors = doctorsQuery.data?.data ?? [];

  const comparisonQuery = useQuery({
    queryKey: ["doctor-analytics-comparison", serviceId, periodId, selectedDoctorId || null],
    queryFn: () => doctorAnalyticsApi.comparison(serviceId, periodId, selectedDoctorId || undefined),
  });

  const noCompletedRun =
    comparisonQuery.error instanceof ApiRequestError &&
    comparisonQuery.error.status === 404 &&
    comparisonQuery.error.code === "NO_COMPLETED_ALLOCATION_RUN";
  const doctorNotFoundForService =
    comparisonQuery.error instanceof ApiRequestError &&
    comparisonQuery.error.status === 404 &&
    comparisonQuery.error.code === "DOCTOR_NOT_FOUND_FOR_SERVICE";

  const comparison = comparisonQuery.data;
  const identified = comparison !== undefined && isIdentifiedComparison(comparison) ? comparison : null;
  // Same union, inverse branch — `isIdentifiedComparison`'s `is` predicate
  // narrows the positive case cleanly (see `identified` above) but TS
  // doesn't correlate that with excluding the type in a separately
  // re-evaluated negated ternary, so this is asserted rather than inferred;
  // the guard function itself is the single source of truth for the split.
  const aggregate = comparison !== undefined && !identified ? (comparison as DoctorComparisonAggregate) : null;

  const cohort = comparison?.cohort;
  const cohortSummary = useMemo(() => {
    if (!cohort) return null;
    return `Median ${formatCurrencyIDR(cohort.median)} · P25 ${formatCurrencyIDR(cohort.p25)} · P75 ${formatCurrencyIDR(cohort.p75)} · P90 ${formatCurrencyIDR(cohort.p90)} (${cohort.doctorCount} dokter)`;
  }, [cohort]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Variasi Biaya per Dokter — {serviceName}
          <GuidedTooltip content="Raport manajemen, bukan alat menghukum — lihat docs/PRODUCT_BIBLE.md §7. Detail per-dokter hanya untuk peran dengan akses doctor_analytics.read_detail." />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex w-fit flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Lihat detail dokter (opsional)</span>
          <Select value={selectedDoctorId} onChange={(event) => setSelectedDoctorId(event.target.value)}>
            <option value="">Ringkasan kelompok (de-identified)</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </label>

        {comparisonQuery.isLoading ? <LoadingSkeleton /> : null}

        {comparisonQuery.isError && noCompletedRun ? (
          <EmptyState icon={UserRound} title="Perhitungan belum dijalankan" description="Jalankan Cost Allocation untuk melihat variasi biaya dokter." />
        ) : null}

        {comparisonQuery.isError && doctorNotFoundForService ? (
          <EmptyState icon={UserRound} title="Tidak ada data" description="Dokter ini tidak memiliki aktivitas untuk layanan ini pada periode ini." />
        ) : null}

        {comparisonQuery.isError && !noCompletedRun && !doctorNotFoundForService ? (
          <ErrorState message="Gagal memuat perbandingan dokter." onRetry={() => void comparisonQuery.refetch()} />
        ) : null}

        {cohortSummary ? <p className="text-sm text-muted-foreground">Sebaran kelompok: {cohortSummary}</p> : null}

        {aggregate ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {aggregate.bands.map((band) => (
                <div key={band.band} className="rounded-sm border border-border p-3">
                  <div className="text-xs text-muted-foreground">{BAND_LABELS[band.band] ?? band.band}</div>
                  <div className="text-lg font-semibold text-foreground">{band.doctorCount} dokter</div>
                </div>
              ))}
            </div>
            {aggregate.insufficientDataDoctorCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                {aggregate.insufficientDataDoctorCount} dokter memiliki kasus di bawah jumlah sampel minimum dan dikecualikan dari perbandingan ini.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">Pilih seorang dokter di atas untuk melihat detail (memerlukan akses detail dokter).</p>
          </div>
        ) : null}

        {identified ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-base font-semibold text-foreground">{identified.doctorName}</div>
              <div className="text-sm text-muted-foreground">
                {identified.caseCount} kasus periode ini
                {identified.unitCostEquivalent !== null ? ` · Unit cost ekuivalen ${formatCurrencyIDR(identified.unitCostEquivalent)}` : ""}
              </div>
            </div>

            {!identified.sufficientSample ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Sampel belum cukup untuk perbandingan kelompok (kurang dari 5 kasus periode ini) — faktor kontribusi tetap ditampilkan di bawah.
              </p>
            ) : identified.percentileBand ? (
              <p className="text-sm text-foreground">
                Posisi kelompok: <span className="font-medium">{BAND_LABELS[identified.percentileBand] ?? identified.percentileBand}</span>
                {identified.totalCostDelta !== null ? ` · Selisih biaya total ${formatCurrencyIDR(identified.totalCostDelta)} dari median kelompok` : ""}
              </p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Faktor</th>
                    <th className="py-2 pr-4 font-medium">Rata-rata Dokter Ini</th>
                    <th className="py-2 pr-4 font-medium">Median Kelompok</th>
                    <th className="py-2 font-medium">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {identified.factors.map((factor) => (
                    <tr key={factor.factor} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4">{FACTOR_LABELS[factor.factor] ?? factor.factor}</td>
                      <td className="py-2 pr-4">{factorValue(factor, "doctorAvg")}</td>
                      <td className="py-2 pr-4">{factorValue(factor, "cohortMedian")}</td>
                      <td className="py-2">{factor.delta === null ? "—" : factor.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
