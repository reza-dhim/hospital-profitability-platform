import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type BmhpItem = components["schemas"]["BmhpItemResponseDto"];
export type CreateBmhpItemDto = components["schemas"]["CreateBmhpItemDto"];
export type UpdateBmhpItemDto = components["schemas"]["UpdateBmhpItemDto"];

export const bmhpItemMasterDataApi = createMasterDataApi<BmhpItem, CreateBmhpItemDto, UpdateBmhpItemDto>("bmhp-items");
