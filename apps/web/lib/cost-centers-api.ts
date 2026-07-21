import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";
import { createMasterDataApi } from "./master-data-api";

export type CostCenter = components["schemas"]["CostCenterResponseDto"];
export type PaginatedCostCenters = components["schemas"]["PaginatedCostCenterResponseDto"];
export type CreateCostCenterDto = components["schemas"]["CreateCostCenterDto"];
export type UpdateCostCenterDto = components["schemas"]["UpdateCostCenterDto"];

/** Lightweight lookup only (id/code/name) — used by Cost Allocation's FK-name resolution. */
export const costCentersApi = {
  list: () => apiRequest<PaginatedCostCenters>("/cost-centers", { query: { limit: 100 } }),
};

/** Full CRUD (paginated/searchable/filterable/sortable) — used by the Master Data page. */
export const costCenterMasterDataApi = createMasterDataApi<CostCenter, CreateCostCenterDto, UpdateCostCenterDto>(
  "cost-centers"
);
