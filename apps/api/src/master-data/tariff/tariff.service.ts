import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { CrudDelegate, MasterDataCrudService } from "../../common/crud/master-data-crud.service";
import { CreateTariffDto } from "./dto/create-tariff.dto";
import { UpdateTariffDto } from "./dto/update-tariff.dto";
import type { TariffResponseDto } from "./dto/tariff-response.dto";

/**
 * Overrides `create()` instead of relying on the generic engine's default:
 * a new tariff isn't just an insert — per docs/02_DOMAIN_MODEL.md's `tariffs`
 * note, it must (1) supersede whatever tariff was previously active for the
 * same service and (2) sync the denormalized `Service.currentTariff`
 * pointer, both in the same transaction. `findAll`/`findOne`/`update`/`remove`
 * still use the inherited generic behavior — only creation has this extra
 * invariant. Sprint 3 is basic CRUD only (`ARCHITECT_AUDIT.md` Sprint 3): the
 * caller with `tariff.write` sets the tariff directly (`approvedByUserId`/
 * `approvedAt` = the caller, now) — there is no separate propose/approve
 * workflow yet (that's `tariff.propose`/`tariff.approve`, a later sprint).
 */
@Injectable()
export class TariffService extends MasterDataCrudService<TariffResponseDto, CreateTariffDto, UpdateTariffDto> {
  constructor(prisma: PrismaService, auditContextService: AuditContextService) {
    super(prisma, auditContextService, prisma.tariff as unknown as CrudDelegate, {
      entity: "tariff",
      notFoundCode: "TARIFF_NOT_FOUND",
      conflictCode: "TARIFF_DUPLICATE",
      fieldConfig: {
        searchableFields: [],
        filterableFields: ["serviceId", "status"],
        sortableFields: ["effectiveDate", "currentTariff", "createdAt", "updatedAt"],
        defaultSort: "effectiveDate",
      },
    });
  }

  override async create(hospitalId: string, dto: CreateTariffDto, actorUserId: string): Promise<TariffResponseDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.tariff.updateMany({
        where: { hospitalId, serviceId: dto.serviceId, status: "active", deletedAt: null },
        data: { status: "superseded", updatedByUserId: actorUserId },
      });

      const tariff = await tx.tariff.create({
        data: {
          hospitalId,
          serviceId: dto.serviceId,
          currentTariff: dto.currentTariff,
          recommendedTariff: dto.recommendedTariff,
          effectiveDate: new Date(dto.effectiveDate),
          approvedByUserId: actorUserId,
          approvedAt: new Date(),
          status: "active",
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
      });

      await tx.service.update({
        where: { id: dto.serviceId },
        data: { currentTariff: dto.currentTariff },
      });

      return tariff;
    });

    this.auditContextService.record({
      entity: this.options.entity,
      action: `${this.options.entity}.create`,
      entityId: created.id,
      before: null,
      after: created,
    });
    return created;
  }
}
