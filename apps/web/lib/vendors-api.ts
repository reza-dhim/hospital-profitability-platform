import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type Vendor = components["schemas"]["VendorResponseDto"];
export type CreateVendorDto = components["schemas"]["CreateVendorDto"];
export type UpdateVendorDto = components["schemas"]["UpdateVendorDto"];

export const vendorMasterDataApi = createMasterDataApi<Vendor, CreateVendorDto, UpdateVendorDto>("vendors");
