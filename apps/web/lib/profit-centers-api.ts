import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";
import { createMasterDataApi } from "./master-data-api";

export type ProfitCenter = components["schemas"]["ProfitCenterResponseDto"];
export type PaginatedProfitCenters = components["schemas"]["PaginatedProfitCenterResponseDto"];
export type CreateProfitCenterDto = components["schemas"]["CreateProfitCenterDto"];
export type UpdateProfitCenterDto = components["schemas"]["UpdateProfitCenterDto"];

/** Lightweight lookup only (id/code/name) — used by Cost Allocation's FK-name resolution. */
export const profitCentersApi = {
  list: () => apiRequest<PaginatedProfitCenters>("/profit-centers", { query: { limit: 100 } }),
};

/** Full CRUD (paginated/searchable/filterable/sortable) — used by the Master Data page. */
export const profitCenterMasterDataApi = createMasterDataApi<ProfitCenter, CreateProfitCenterDto, UpdateProfitCenterDto>(
  "profit-centers"
);
