import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type ProfitabilitySummary = components["schemas"]["ProfitabilitySummaryResponseDto"];
export type ProfitCenterProfitabilityRow = components["schemas"]["ProfitCenterProfitabilityRowDto"];
export type ProfitCenterProfitability = components["schemas"]["ProfitCenterProfitabilityResponseDto"];
export type ProfitabilityTrend = components["schemas"]["ProfitabilityTrendResponseDto"];

/** docs/09_PROFITABILITY_ENGINE.md — read-only, scoped to the latest completed, non-stale run for `periodId`. */
export const profitabilityApi = {
  summary: (periodId: string) => apiRequest<ProfitabilitySummary>("/profitability/summary", { query: { periodId } }),

  /** Ranked by margin, descending — docs/38_DASHBOARD_SPECIFICATION.md §3 "Top/Bottom N ranking". */
  profitCenters: (periodId: string) =>
    apiRequest<ProfitCenterProfitability>("/profitability/profit-centers", {
      query: { periodId, sortBy: "margin", order: "desc" },
    }),

  trends: (profitCenterId: string) =>
    apiRequest<ProfitabilityTrend>("/profitability/trends", { query: { profitCenterId } }),
};
