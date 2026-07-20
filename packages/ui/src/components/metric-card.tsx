import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "./card";
import { Skeleton } from "./loading-skeleton";
import { cn } from "../lib/cn";

export interface MetricCardTrend {
  /** Pre-formatted delta text (e.g. "+Rp 2.500.000 (12,3%)") — this component never formats/rounds financial figures itself. */
  label: string;
  direction: "up" | "down" | "flat";
}

export interface MetricCardProps {
  label: string;
  value: string;
  loading?: boolean;
  trend?: MetricCardTrend;
  className?: string;
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/** Single KPI display (docs/37_COMPONENT_LIBRARY.md §2). Trend direction is never color-only (docs/35_ACCESSIBILITY.md §2) — an icon and text label always accompany the color. */
export function MetricCard({ label, value, loading = false, trend, className }: MetricCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="gap-2 pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {trend ? (
          <p
            className={cn(
              "flex items-center gap-1 text-sm",
              trend.direction === "up" && "text-emerald-600 dark:text-emerald-400",
              trend.direction === "down" && "text-destructive",
              trend.direction === "flat" && "text-muted-foreground"
            )}
          >
            {TrendIcon ? <TrendIcon className="h-4 w-4" aria-hidden="true" /> : null}
            {trend.label}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
