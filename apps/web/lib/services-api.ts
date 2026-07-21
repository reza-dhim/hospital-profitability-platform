import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type ServiceEntity = components["schemas"]["ServiceResponseDto"];
export type CreateServiceDto = components["schemas"]["CreateServiceDto"];
export type UpdateServiceDto = components["schemas"]["UpdateServiceDto"];

export const serviceMasterDataApi = createMasterDataApi<ServiceEntity, CreateServiceDto, UpdateServiceDto>("services");
