import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type Period = components["schemas"]["PeriodResponseDto"];
export type PaginatedPeriods = components["schemas"]["PaginatedPeriodResponseDto"];

export const periodsApi = {
  list: () => apiRequest<PaginatedPeriods>("/periods", { query: { limit: 100 } }),
};
