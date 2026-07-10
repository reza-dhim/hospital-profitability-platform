import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";
import type { ServiceResponseDto } from "./dto/service-response.dto";

/** Named `MedicalServiceService` (not `ServiceService`) purely for readability — the Prisma model is `Service`. */
@Injectable()
export class MedicalServiceService extends MasterDataCrudService<
  ServiceResponseDto,
  CreateServiceDto,
  UpdateServiceDto
> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.service as unknown as CrudDelegate, {
      entity: "service",
      notFoundCode: "SERVICE_NOT_FOUND",
      conflictCode: "SERVICE_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["profitCenterId", "serviceType"],
        sortableFields: ["code", "name", "serviceType", "standardDuration", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
