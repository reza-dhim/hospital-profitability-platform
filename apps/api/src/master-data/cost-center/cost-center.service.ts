import { BadRequestException, Injectable } from "@nestjs/common";
import { CostCenterType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateCostCenterDto } from "./dto/create-cost-center.dto";
import { UpdateCostCenterDto } from "./dto/update-cost-center.dto";
import type { CostCenterResponseDto } from "./dto/cost-center-response.dto";

function inconsistentDirectLink(): BadRequestException {
  return new BadRequestException({
    code: "COST_CENTER_TYPE_PROFIT_CENTER_MISMATCH",
    message: "type = 'direct' requires profitCenterId; type = 'indirect' must not set one.",
  });
}

/**
 * docs/22_ACCEPTANCE_CRITERIA.md §2 full CRUD, via the generic engine
 * (`common/crud`). Overrides `create()`/`update()` only to guard the
 * `type`/`profitCenterId` invariant the DB `CHECK` constraint also enforces
 * (Sprint 6 sub-task 0) — `CreateCostCenterDto`'s `@ValidateIf` already
 * requires `profitCenterId` when `type = 'direct'`, but can't forbid it for
 * `'indirect'` from the DTO alone (a stray value would otherwise reach
 * Postgres and surface as a raw constraint-violation 500 instead of a clean
 * 400). Known limitation: switching an existing `direct` cost center back
 * to `indirect` via `update()` can't clear `profitCenterId` to null through
 * this DTO shape (`PartialType` has no "explicitly null" case) — out of
 * scope for this sub-task, same limitation the rest of the generic update
 * DTOs already have.
 */
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

  override async create(
    hospitalId: string,
    dto: CreateCostCenterDto,
    actorUserId: string
  ): Promise<CostCenterResponseDto> {
    if (dto.type === CostCenterType.indirect && dto.profitCenterId) throw inconsistentDirectLink();
    return super.create(hospitalId, dto, actorUserId);
  }

  override async update(
    hospitalId: string,
    id: string,
    dto: UpdateCostCenterDto,
    actorUserId: string
  ): Promise<CostCenterResponseDto> {
    if (dto.type !== undefined || dto.profitCenterId !== undefined) {
      const before = await this.findOne(hospitalId, id);
      const effectiveType = dto.type ?? before.type;
      const effectiveProfitCenterId = dto.profitCenterId !== undefined ? dto.profitCenterId : before.profitCenterId;
      if (effectiveType === CostCenterType.direct && !effectiveProfitCenterId) throw inconsistentDirectLink();
      if (effectiveType === CostCenterType.indirect && effectiveProfitCenterId) throw inconsistentDirectLink();
    }
    return super.update(hospitalId, id, dto, actorUserId);
  }
}
