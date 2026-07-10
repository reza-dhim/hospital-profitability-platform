import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateCoaAccountDto } from "./dto/create-coa-account.dto";
import { UpdateCoaAccountDto } from "./dto/update-coa-account.dto";
import type { CoaAccountResponseDto } from "./dto/coa-account-response.dto";

@Injectable()
export class CoaAccountService extends MasterDataCrudService<
  CoaAccountResponseDto,
  CreateCoaAccountDto,
  UpdateCoaAccountDto
> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.coaAccount as unknown as CrudDelegate, {
      entity: "coa_account",
      notFoundCode: "COA_ACCOUNT_NOT_FOUND",
      conflictCode: "COA_ACCOUNT_CODE_TAKEN",
      fieldConfig: {
        searchableFields: ["code", "name"],
        filterableFields: ["category"],
        sortableFields: ["code", "name", "category", "createdAt", "updatedAt"],
        defaultSort: "code",
      },
    });
  }
}
