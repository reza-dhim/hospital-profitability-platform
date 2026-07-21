import type { components } from "@hpp/contracts";
import { createMasterDataApi } from "./master-data-api";

export type AllocationRule = components["schemas"]["AllocationRuleResponseDto"];
export type CreateAllocationRuleDto = components["schemas"]["CreateAllocationRuleDto"];
export type UpdateAllocationRuleDto = components["schemas"]["UpdateAllocationRuleDto"];

export const allocationRuleMasterDataApi = createMasterDataApi<
  AllocationRule,
  CreateAllocationRuleDto,
  UpdateAllocationRuleDto
>("allocation-rules");
