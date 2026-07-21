import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";
import { createMasterDataApi } from "./master-data-api";

export type Driver = components["schemas"]["DriverResponseDto"];
export type PaginatedDrivers = components["schemas"]["PaginatedDriverResponseDto"];
export type CreateDriverDto = components["schemas"]["CreateDriverDto"];
export type UpdateDriverDto = components["schemas"]["UpdateDriverDto"];

/** Lightweight lookup only (id/code/name) — used by Cost Allocation's FK-name resolution. */
export const driversApi = {
  list: () => apiRequest<PaginatedDrivers>("/drivers", { query: { limit: 100 } }),
};

/** Full CRUD (paginated/searchable/filterable/sortable) — used by the Master Data page. */
export const driverMasterDataApi = createMasterDataApi<Driver, CreateDriverDto, UpdateDriverDto>("drivers");
