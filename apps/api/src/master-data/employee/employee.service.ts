import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import type { EmployeeResponseDto } from "./dto/employee-response.dto";

@Injectable()
export class EmployeeService extends MasterDataCrudService<EmployeeResponseDto, CreateEmployeeDto, UpdateEmployeeDto> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.employee as unknown as CrudDelegate, {
      entity: "employee",
      notFoundCode: "EMPLOYEE_NOT_FOUND",
      conflictCode: "EMPLOYEE_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["departmentCostCenterId", "employmentType", "status"],
        sortableFields: ["code", "name", "employmentType", "status", "createdAt", "updatedAt"],
        defaultSort: "name",
      },
    });
  }
}
