"use client";

import ReactECharts from "echarts-for-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, LoadingSkeleton } from "@hpp/ui";
import { profitabilityApi } from "../lib/profitability-api";
import { formatCurrencyIDR } from "../lib/format";

/**
 * docs/38_DASHBOARD_SPECIFICATION.md §1/§3: "Revenue/Cost/Margin trend chart".
 * The backend only exposes a per-profit-center trend
 * (`GET /profitability/trends?profitCenterId=`), not a single hospital-wide
 * series, so this renders one revenue line per profit center instead —
 * still answers "how is each unit trending", just not pre-summed.
 */
export function ProfitabilityTrendChart({ periodId }: { periodId: string }) {
  const profitCentersQuery = useQuery({
    queryKey: ["profitability-profit-centers", periodId],
    queryFn: () => profitabilityApi.profitCenters(periodId),
  });

  const profitCenters = profitCentersQuery.data?.data ?? [];

  const trendQueries = useQueries({
    queries: profitCenters.map((pc) => ({
      queryKey: ["profitability-trends", pc.profitCenterId],
      queryFn: () => profitabilityApi.trends(pc.profitCenterId),
      enabled: profitCentersQuery.isSuccess,
    })),
  });

  if (profitCentersQuery.isPending || (profitCenters.length > 0 && trendQueries.some((q) => q.isPending))) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tren Pendapatan per Profit Center</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (profitCentersQuery.isError || trendQueries.some((q) => q.isError)) {
    return (
      <ErrorState
        message="Gagal memuat tren profitabilitas."
        onRetry={() => {
          void profitCentersQuery.refetch();
          trendQueries.forEach((q) => void q.refetch());
        }}
      />
    );
  }

  if (profitCenters.length === 0) {
    return (
      <EmptyState
        title="Belum ada tren"
        description="Tren akan muncul setelah ada lebih dari satu periode dengan perhitungan selesai."
      />
    );
  }

  const periodLabels = Array.from(
    new Set(trendQueries.flatMap((q) => (q.data?.data ?? []).map((point) => point.periodLabel)))
  ).sort();

  const series = profitCenters.map((pc, index) => {
    const points = trendQueries[index]?.data?.data ?? [];
    const byLabel = new Map(points.map((point) => [point.periodLabel, Number(point.revenue)]));
    return {
      name: pc.profitCenterName,
      type: "line",
      data: periodLabels.map((label) => byLabel.get(label) ?? null),
      connectNulls: false,
    };
  });

  const option = {
    grid: { left: 90, right: 24, top: 48, bottom: 32 },
    legend: { top: 0, type: "scroll" },
    xAxis: { type: "category", data: periodLabels },
    yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatCurrencyIDR(value) } },
    tooltip: { trigger: "axis", valueFormatter: (value: number | null) => (value === null ? "-" : formatCurrencyIDR(value)) },
    series,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tren Pendapatan per Profit Center</CardTitle>
      </CardHeader>
      <CardContent>
        <ReactECharts option={option} style={{ height: 320 }} />
      </CardContent>
    </Card>
  );
}
