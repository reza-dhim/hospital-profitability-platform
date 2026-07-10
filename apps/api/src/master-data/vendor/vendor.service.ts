import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateVendorDto } from "./dto/create-vendor.dto";
import { UpdateVendorDto } from "./dto/update-vendor.dto";
import type { VendorResponseDto } from "./dto/vendor-response.dto";

@Injectable()
export class VendorService extends MasterDataCrudService<VendorResponseDto, CreateVendorDto, UpdateVendorDto> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.vendor as unknown as CrudDelegate, {
      entity: "vendor",
      notFoundCode: "VENDOR_NOT_FOUND",
      conflictCode: "VENDOR_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["category", "status"],
        sortableFields: ["code", "name", "category", "status", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
