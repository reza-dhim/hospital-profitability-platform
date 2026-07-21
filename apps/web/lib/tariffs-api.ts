import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type Tariff = components["schemas"]["TariffResponseDto"];
export type CreateTariffDto = components["schemas"]["CreateTariffDto"];
export type UpdateTariffDto = components["schemas"]["UpdateTariffDto"];

export const tariffMasterDataApi = createMasterDataApi<Tariff, CreateTariffDto, UpdateTariffDto>("tariffs");
