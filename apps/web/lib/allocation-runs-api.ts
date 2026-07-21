import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type AllocationRun = components["schemas"]["AllocationRunResponseDto"];
export type AllocationRunWarning = components["schemas"]["AllocationRunWarningDto"];
export type PaginatedAllocationRuns = components["schemas"]["PaginatedAllocationRunResponseDto"];
export type AllocatedCost = components["schemas"]["AllocatedCostResponseDto"];
export type PaginatedAllocatedCosts = components["schemas"]["PaginatedAllocatedCostResponseDto"];
export type AllocationMethod = "direct" | "step_down";

export interface ListAllocationRunsQuery {
  status?: AllocationRun["status"];
  periodId?: string;
  page?: number;
  limit?: number;
  [key: string]: string | number | boolean | undefined;
}

/** docs/08_COST_ALLOCATION_ENGINE.md — cost allocation run pipeline. */
export const allocationRunsApi = {
  list: (query: ListAllocationRunsQuery = {}) => apiRequest<PaginatedAllocationRuns>("/allocation-runs", { query }),
  get: (id: string) => apiRequest<AllocationRun>(`/allocation-runs/${id}`),

  getAllocatedCosts: (id: string, query: { page?: number; limit?: number } = {}) =>
    apiRequest<PaginatedAllocatedCosts>(`/allocation-runs/${id}/allocated-costs`, { query }),

  create: (periodId: string, method: AllocationMethod) =>
    apiRequest<AllocationRun>("/allocation-runs", { method: "POST", body: { periodId, method } }),

  /** Creates a new run superseding this one (`supersedesRunId`) — never mutates the original. Only valid on `completed`/`failed` runs. */
  recalculate: (id: string) => apiRequest<AllocationRun>(`/allocation-runs/${id}/recalculate`, { method: "POST" }),
};
