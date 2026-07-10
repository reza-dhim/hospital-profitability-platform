import { PartialType } from "@nestjs/swagger";
import { CreateAllocationRuleDto } from "./create-allocation-rule.dto";

export class UpdateAllocationRuleDto extends PartialType(CreateAllocationRuleDto) {}
