import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { UpdateDriverDto } from "./dto/update-driver.dto";
import type { DriverResponseDto } from "./dto/driver-response.dto";

@Injectable()
export class DriverService extends MasterDataCrudService<DriverResponseDto, CreateDriverDto, UpdateDriverDto> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.driver as unknown as CrudDelegate, {
      entity: "driver",
      notFoundCode: "DRIVER_NOT_FOUND",
      conflictCode: "DRIVER_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["unit"],
        sortableFields: ["code", "name", "unit", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
