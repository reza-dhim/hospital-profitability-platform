import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateCostCenterDto } from "./dto/create-cost-center.dto";
import { UpdateCostCenterDto } from "./dto/update-cost-center.dto";
import type { CostCenterResponseDto } from "./dto/cost-center-response.dto";

/** docs/22_ACCEPTANCE_CRITERIA.md §2 full CRUD, via the generic engine (`common/crud`). */
@Injectable()
export class CostCenterService extends MasterDataCrudService<
  CostCenterResponseDto,
  CreateCostCenterDto,
  UpdateCostCenterDto
> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.costCenter as unknown as CrudDelegate, {
      entity: "cost_center",
      notFoundCode: "COST_CENTER_NOT_FOUND",
      conflictCode: "COST_CENTER_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["type", "status"],
        sortableFields: ["code", "name", "type", "status", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
