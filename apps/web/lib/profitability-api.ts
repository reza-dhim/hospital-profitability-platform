import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type ProfitabilitySummary = components["schemas"]["ProfitabilitySummaryResponseDto"];
export type ProfitCenterProfitabilityRow = components["schemas"]["ProfitCenterProfitabilityRowDto"];
export type ProfitCenterProfitability = components["schemas"]["ProfitCenterProfitabilityResponseDto"];
export type ProfitabilityTrend = components["schemas"]["ProfitabilityTrendResponseDto"];
export type ServiceUnitCostRow = components["schemas"]["ServiceUnitCostRowDto"];
export type ServiceUnitCost = components["schemas"]["ServiceUnitCostResponseDto"];

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

  /** Per-service unit cost, tariff gap, and (formula-calculated, not AI-suggested — docs/10_UNIT_COST_ENGINE.md §4) recommended tariff. */
  services: (periodId: string) => apiRequest<ServiceUnitCost>("/profitability/services", { query: { periodId } }),
};
