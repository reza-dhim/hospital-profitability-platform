import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { UpdateAssetDto } from "./dto/update-asset.dto";
import type { AssetResponseDto } from "./dto/asset-response.dto";

@Injectable()
export class AssetService extends MasterDataCrudService<AssetResponseDto, CreateAssetDto, UpdateAssetDto> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.asset as unknown as CrudDelegate, {
      entity: "asset",
      notFoundCode: "ASSET_NOT_FOUND",
      conflictCode: "ASSET_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["category", "costCenterId", "status"],
        sortableFields: ["code", "name", "category", "acquisitionCost", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
