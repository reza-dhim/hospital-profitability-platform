import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type AllocationRun = components["schemas"]["AllocationRunResponseDto"];
export type PaginatedAllocationRuns = components["schemas"]["PaginatedAllocationRunResponseDto"];

export const allocationRunsApi = {
  list: (query: { status?: "completed"; limit?: number } = {}) =>
    apiRequest<PaginatedAllocationRuns>("/allocation-runs", { query }),
};
