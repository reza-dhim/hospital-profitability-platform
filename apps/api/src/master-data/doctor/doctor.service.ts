import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateDoctorDto } from "./dto/create-doctor.dto";
import { UpdateDoctorDto } from "./dto/update-doctor.dto";
import type { DoctorResponseDto } from "./dto/doctor-response.dto";

@Injectable()
export class DoctorService extends MasterDataCrudService<DoctorResponseDto, CreateDoctorDto, UpdateDoctorDto> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.doctor as unknown as CrudDelegate, {
      entity: "doctor",
      notFoundCode: "DOCTOR_NOT_FOUND",
      conflictCode: "DOCTOR_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name", "specialty"],
        filterableFields: ["specialty", "status"],
        sortableFields: ["code", "name", "specialty", "status", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
