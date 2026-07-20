"use client";

import ReactECharts from "echarts-for-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, LoadingSkeleton } from "@hpp/ui";
import { profitabilityApi } from "../lib/profitability-api";
import { formatPercent } from "../lib/format";

/** docs/38_DASHBOARD_SPECIFICATION.md §1/§3: "Top/Bottom profit center ranking" — horizontal bar chart, sorted by margin. */
export function ProfitCenterRanking({ periodId }: { periodId: string }) {
  const query = useQuery({
    queryKey: ["profitability-profit-centers", periodId],
    queryFn: () => profitabilityApi.profitCenters(periodId),
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Peringkat Profit Center</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <ErrorState message="Gagal memuat peringkat profit center." onRetry={() => void query.refetch()} />
    );
  }

  const rows = query.data?.data ?? [];
  const ranked = rows.filter((row) => row.margin !== null).sort((a, b) => Number(b.margin) - Number(a.margin));
  const unranked = rows.filter((row) => row.margin === null);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Belum ada profit center"
        description="Data akan muncul setelah cost center dan profit center dikonfigurasi."
      />
    );
  }

  const option = {
    grid: { left: 140, right: 48, top: 16, bottom: 16 },
    xAxis: { type: "value", axisLabel: { formatter: (value: number) => `${value}%` } },
    yAxis: {
      type: "category",
      data: [...ranked].reverse().map((row) => row.profitCenterName),
      axisLabel: { width: 120, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: [...ranked].reverse().map((row) => Number(row.margin)),
        label: { show: true, position: "right", formatter: (p: { value: number }) => formatPercent(p.value) },
        itemStyle: { color: (p: { value: number }) => (p.value < 0 ? "#dc2626" : "#4f6df5") },
      },
    ],
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Peringkat Profit Center (Margin)</CardTitle>
      </CardHeader>
      <CardContent>
        <ReactECharts option={option} style={{ height: Math.max(ranked.length * 40, 120) }} />
        {unranked.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Belum ada pendapatan periode ini: {unranked.map((row) => row.profitCenterName).join(", ")}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
