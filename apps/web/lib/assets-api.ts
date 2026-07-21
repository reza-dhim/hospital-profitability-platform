import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type Asset = components["schemas"]["AssetResponseDto"];
export type CreateAssetDto = components["schemas"]["CreateAssetDto"];
export type UpdateAssetDto = components["schemas"]["UpdateAssetDto"];

export const assetMasterDataApi = createMasterDataApi<Asset, CreateAssetDto, UpdateAssetDto>("assets");
