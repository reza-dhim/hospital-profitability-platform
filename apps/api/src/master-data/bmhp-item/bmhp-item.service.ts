import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateBmhpItemDto } from "./dto/create-bmhp-item.dto";
import { UpdateBmhpItemDto } from "./dto/update-bmhp-item.dto";
import type { BmhpItemResponseDto } from "./dto/bmhp-item-response.dto";

@Injectable()
export class BmhpItemService extends MasterDataCrudService<BmhpItemResponseDto, CreateBmhpItemDto, UpdateBmhpItemDto> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.bmhpItem as unknown as CrudDelegate, {
      entity: "bmhp_item",
      notFoundCode: "BMHP_ITEM_NOT_FOUND",
      conflictCode: "BMHP_ITEM_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["vendorId", "status"],
        sortableFields: ["code", "name", "standardCost", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
