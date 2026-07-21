import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type CoaAccount = components["schemas"]["CoaAccountResponseDto"];
export type CreateCoaAccountDto = components["schemas"]["CreateCoaAccountDto"];
export type UpdateCoaAccountDto = components["schemas"]["UpdateCoaAccountDto"];

export const coaAccountMasterDataApi = createMasterDataApi<CoaAccount, CreateCoaAccountDto, UpdateCoaAccountDto>(
  "coa-accounts"
);
