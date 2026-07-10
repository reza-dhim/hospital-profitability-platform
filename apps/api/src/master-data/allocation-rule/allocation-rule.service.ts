import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateAllocationRuleDto } from "./dto/create-allocation-rule.dto";
import { UpdateAllocationRuleDto } from "./dto/update-allocation-rule.dto";
import type { AllocationRuleResponseDto } from "./dto/allocation-rule-response.dto";

@Injectable()
export class AllocationRuleService extends MasterDataCrudService<
  AllocationRuleResponseDto,
  CreateAllocationRuleDto,
  UpdateAllocationRuleDto
> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.allocationRule as unknown as CrudDelegate, {
      entity: "allocation_rule",
      notFoundCode: "ALLOCATION_RULE_NOT_FOUND",
      conflictCode: "ALLOCATION_RULE_DUPLICATE",
      conflictMessage: "An allocation rule for this cost center, driver, and period already exists.",
      fieldConfig: {
        searchableFields: ["effectivePeriod"],
        filterableFields: ["costCenterId", "driverId", "effectivePeriod", "method"],
        sortableFields: ["priority", "effectivePeriod", "createdAt", "updatedAt"],
        defaultSort: "priority",
      },
    });
  }
}
