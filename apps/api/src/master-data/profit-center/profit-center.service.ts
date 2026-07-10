import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateProfitCenterDto } from "./dto/create-profit-center.dto";
import { UpdateProfitCenterDto } from "./dto/update-profit-center.dto";
import type { ProfitCenterResponseDto } from "./dto/profit-center-response.dto";

@Injectable()
export class ProfitCenterService extends MasterDataCrudService<
  ProfitCenterResponseDto,
  CreateProfitCenterDto,
  UpdateProfitCenterDto
> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.profitCenter as unknown as CrudDelegate, {
      entity: "profit_center",
      notFoundCode: "PROFIT_CENTER_NOT_FOUND",
      conflictCode: "PROFIT_CENTER_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["department", "status"],
        sortableFields: ["code", "name", "department", "status", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
