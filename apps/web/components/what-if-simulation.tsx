"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  ErrorState,
  GuidedTooltip,
  Input,
  LoadingSkeleton,
  PageHeader,
  Select,
  type DataTableColumn,
} from "@hpp/ui";
import { FlaskConical } from "lucide-react";
import { periodsApi } from "../lib/periods-api";
import { profitabilityApi } from "../lib/profitability-api";
import { whatIfApi, type WhatIfSimulationResult } from "../lib/what-if-api";
import { formatCurrencyIDR, formatPercent } from "../lib/format";
import { ApiRequestError } from "../lib/api-client";

function moneyOrDash(value: string | null): string {
  return value === null ? "—" : formatCurrencyIDR(value);
}

function numberOrDash(value: string | null): string {
  return value === null ? "—" : new Intl.NumberFormat("id-ID").format(Number(value));
}

function percentOrDash(value: string | null): string {
  return value === null ? "—" : formatPercent(value);
}

/**
 * The absolute and percentage deltas can have opposite signs (e.g. tariff
 * gap crossing zero: -60,000 -> 15,000 is a positive absolute change but a
 * negative percentage change relative to a negative baseline) — each gets
 * its own +/- prefix rather than sharing the absolute's sign.
 */
function deltaCell(absolute: string, percentage: string | null, formatAbsolute: (value: string) => string) {
  const numeric = Number(absolute);
  const sign = numeric > 0 ? "+" : "";
  const percentageSign = percentage !== null && Number(percentage) > 0 ? "+" : "";
  const colorClass = numeric > 0 ? "text-emerald-600 dark:text-emerald-400" : numeric < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={colorClass}>
      {sign}
      {formatAbsolute(absolute)}
      {percentage !== null ? ` (${percentageSign}${formatPercent(percentage)})` : ""}
    </span>
  );
}

interface FigureRow {
  key: string;
  label: string;
  baseline: string;
  hypothetical: string;
  delta: React.ReactNode;
}

function figureColumns(): DataTableColumn<FigureRow>[] {
  return [
    { header: "Angka", render: (row) => row.label },
    { header: "Baseline (Aktual)", align: "right", render: (row) => row.baseline },
    { header: "Hipotetis", align: "right", render: (row) => row.hypothetical },
    { header: "Delta", align: "right", render: (row) => row.delta },
  ];
}

function buildServiceRows(result: WhatIfSimulationResult): FigureRow[] {
  const { serviceBaseline: b, serviceHypothetical: h, serviceDeltas: d } = result;
  return [
    { key: "tariff", label: "Tarif", baseline: moneyOrDash(b.tariff), hypothetical: moneyOrDash(h.tariff), delta: "—" },
    { key: "volume", label: "Volume", baseline: numberOrDash(b.volume), hypothetical: numberOrDash(h.volume), delta: "—" },
    {
      key: "revenue",
      label: "Pendapatan",
      baseline: moneyOrDash(b.revenue),
      hypothetical: moneyOrDash(h.revenue),
      delta: deltaCell(d.revenue.absolute, d.revenue.percentage, formatCurrencyIDR),
    },
    { key: "allocatedCost", label: "Biaya Alokasi", baseline: moneyOrDash(b.allocatedCost), hypothetical: moneyOrDash(h.allocatedCost), delta: "Tetap" },
    { key: "directCost", label: "Biaya Langsung", baseline: moneyOrDash(b.directCost), hypothetical: moneyOrDash(h.directCost), delta: "—" },
    {
      key: "totalCost",
      label: "Total Biaya",
      baseline: moneyOrDash(b.totalCost),
      hypothetical: moneyOrDash(h.totalCost),
      delta: deltaCell(d.totalCost.absolute, d.totalCost.percentage, formatCurrencyIDR),
    },
    {
      key: "unitCost",
      label: "Unit Cost",
      baseline: moneyOrDash(b.unitCost),
      hypothetical: moneyOrDash(h.unitCost),
      delta: d.unitCost ? deltaCell(d.unitCost.absolute, d.unitCost.percentage, formatCurrencyIDR) : "—",
    },
    {
      key: "tariffGap",
      label: "Selisih Tarif",
      baseline: moneyOrDash(b.tariffGap),
      hypothetical: moneyOrDash(h.tariffGap),
      delta: d.tariffGap ? deltaCell(d.tariffGap.absolute, d.tariffGap.percentage, formatCurrencyIDR) : "—",
    },
    { key: "recommendedTariff", label: "Tarif Rekomendasi (Kalkulasi)", baseline: moneyOrDash(b.recommendedTariff), hypothetical: moneyOrDash(h.recommendedTariff), delta: "—" },
  ];
}

function buildProfitCenterRows(result: WhatIfSimulationResult): FigureRow[] {
  const { profitCenterBaseline: b, profitCenterHypothetical: h, profitCenterDeltas: d } = result;
  return [
    {
      key: "revenue",
      label: "Pendapatan",
      baseline: moneyOrDash(b.revenue),
      hypothetical: moneyOrDash(h.revenue),
      delta: deltaCell(d.revenue.absolute, d.revenue.percentage, formatCurrencyIDR),
    },
    { key: "directCost", label: "Biaya Langsung", baseline: moneyOrDash(b.directCost), hypothetical: moneyOrDash(h.directCost), delta: "Tetap" },
    { key: "allocatedCost", label: "Biaya Alokasi", baseline: moneyOrDash(b.allocatedCost), hypothetical: moneyOrDash(h.allocatedCost), delta: "Tetap" },
    { key: "totalCost", label: "Total Biaya", baseline: moneyOrDash(b.totalCost), hypothetical: moneyOrDash(h.totalCost), delta: "Tetap" },
    {
      key: "grossProfit",
      label: "Laba Kotor",
      baseline: moneyOrDash(b.grossProfit),
      hypothetical: moneyOrDash(h.grossProfit),
      delta: deltaCell(d.grossProfit.absolute, d.grossProfit.percentage, formatCurrencyIDR),
    },
    {
      key: "margin",
      label: "Margin",
      baseline: percentOrDash(b.margin),
      hypothetical: percentOrDash(h.margin),
      delta: d.margin ? deltaCell(d.margin.absolute, d.margin.percentage, (v) => formatPercent(v)) : "—",
    },
  ];
}

function WhatIfResultPanel({ result }: { result: WhatIfSimulationResult }) {
  const serviceRows = useMemo(() => buildServiceRows(result), [result]);
  const profitCenterRows = useMemo(() => buildProfitCenterRows(result), [result]);
  const columns = figureColumns();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 rounded-sm border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <FlaskConical className="h-4 w-4" aria-hidden />
        Simulasi — Tidak Disimpan. Hasil ini tidak pernah ditulis ke basis data; jalankan ulang kapan saja dengan parameter berbeda.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {result.serviceCode} — {result.serviceName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={serviceRows} getRowId={(row) => row.key} page={1} totalPages={1} onPageChange={() => {}} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dampak ke Profit Center: {result.profitCenterName}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={profitCenterRows} getRowId={(row) => row.key} page={1} totalPages={1} onPageChange={() => {}} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * docs/12_AI_ENGINE.md §4 — pure in-memory recomputation, no AI/LLM call.
 * The service selector reuses `profitabilityApi.services(periodId)`
 * (`ServiceUnitCostTable`'s data source) so only services with a real
 * `service_unit_costs` row for the period's latest completed run are
 * offered — the same set `WhatIfSimulationService` can actually simulate
 * against (docs/12_AI_ENGINE.md §4's `WHAT_IF_NO_BASELINE_DATA` case).
 */
export function WhatIfSimulation() {
  const [periodId, setPeriodId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [tariffInput, setTariffInput] = useState("");
  const [volumeInput, setVolumeInput] = useState("");

  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: periodsApi.list });
  const periods = useMemo(
    () => [...(periodsQuery.data?.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [periodsQuery.data]
  );

  const servicesQuery = useQuery({
    queryKey: ["profitability-services", periodId],
    queryFn: () => profitabilityApi.services(periodId),
    enabled: periodId !== "",
  });
  const services = servicesQuery.data?.data ?? [];
  const selectedService = services.find((service) => service.serviceId === serviceId) ?? null;
  const noCompletedRun =
    servicesQuery.error instanceof ApiRequestError &&
    servicesQuery.error.status === 404 &&
    servicesQuery.error.code === "NO_COMPLETED_ALLOCATION_RUN";

  const simulateMutation = useMutation({
    mutationFn: () =>
      whatIfApi.simulate({
        periodId,
        serviceId,
        hypotheticalTariff: tariffInput === "" ? undefined : Number(tariffInput),
        hypotheticalVolume: volumeInput === "" ? undefined : Number(volumeInput),
      }),
  });

  const canSubmit = periodId !== "" && serviceId !== "" && (tariffInput !== "" || volumeInput !== "");

  function handlePeriodChange(nextPeriodId: string) {
    setPeriodId(nextPeriodId);
    setServiceId("");
    simulateMutation.reset();
  }

  function handleServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    setTariffInput("");
    setVolumeInput("");
    simulateMutation.reset();
  }

  return (
    <>
      <PageHeader
        title="What-If Simulation"
        description="Simulasikan dampak perubahan tarif dan/atau volume layanan terhadap unit cost dan profitabilitas — hasil tidak pernah disimpan."
        action={
          <GuidedTooltip content="docs/12_AI_ENGINE.md §4 — menghitung ulang formula profitabilitas & unit cost yang sudah ada dengan input hipotetis, murni matematis, tanpa panggilan AI." />
        }
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Parameter Simulasi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {periodsQuery.isLoading ? <LoadingSkeleton /> : null}
            {periodsQuery.isError ? <ErrorState message="Gagal memuat daftar periode." onRetry={() => void periodsQuery.refetch()} /> : null}

            {periodsQuery.isSuccess ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">Periode</span>
                  <Select value={periodId} onChange={(event) => handlePeriodChange(event.target.value)}>
                    <option value="">Pilih periode</option>
                    {periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">Layanan</span>
                  <Select
                    value={serviceId}
                    onChange={(event) => handleServiceChange(event.target.value)}
                    disabled={periodId === "" || servicesQuery.isLoading || noCompletedRun}
                  >
                    <option value="">Pilih layanan</option>
                    {services.map((service) => (
                      <option key={service.serviceId} value={service.serviceId}>
                        {service.serviceCode} — {service.serviceName}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            ) : null}

            {noCompletedRun ? (
              <p className="text-sm text-muted-foreground">
                Belum ada perhitungan Cost Allocation yang selesai untuk periode ini — jalankan Cost Allocation terlebih dahulu.
              </p>
            ) : null}

            {servicesQuery.isError && !noCompletedRun ? (
              <ErrorState message="Gagal memuat daftar layanan." onRetry={() => void servicesQuery.refetch()} />
            ) : null}

            {selectedService ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1 text-sm">
                  <label htmlFor="what-if-tariff" className="font-medium text-foreground">
                    Tarif Hipotetis
                  </label>
                  <Input
                    id="what-if-tariff"
                    type="number"
                    min={0}
                    placeholder={selectedService.currentTariff ?? "0"}
                    value={tariffInput}
                    onChange={(event) => setTariffInput(event.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">Tarif saat ini: {moneyOrDash(selectedService.currentTariff)}</span>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <label htmlFor="what-if-volume" className="font-medium text-foreground">
                    Volume Hipotetis
                  </label>
                  <Input
                    id="what-if-volume"
                    type="number"
                    min={0}
                    placeholder={selectedService.serviceVolume}
                    value={volumeInput}
                    onChange={(event) => setVolumeInput(event.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">Volume saat ini: {numberOrDash(selectedService.serviceVolume)}</span>
                </div>
              </div>
            ) : null}

            {simulateMutation.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {simulateMutation.error instanceof ApiRequestError ? simulateMutation.error.message : "Gagal menjalankan simulasi."}
              </p>
            ) : null}

            <div>
              <Button type="button" disabled={!canSubmit || simulateMutation.isPending} onClick={() => simulateMutation.mutate()}>
                {simulateMutation.isPending ? "Menghitung..." : "Jalankan Simulasi"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {simulateMutation.data ? <WhatIfResultPanel result={simulateMutation.data} /> : null}
      </div>
    </>
  );
}
