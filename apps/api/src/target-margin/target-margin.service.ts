import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TargetMargin, TargetMarginScopeType } from "@prisma/client";
import { resolveTargetMargin, type Decimal } from "@hpp/domain";
import { PrismaService } from "../prisma/prisma.service";
import { AuditContextService } from "../audit/audit-context.service";
import { paginationMeta, PaginationMetaDto } from "../common/dto/pagination.dto";
import { CreateTargetMarginDto } from "./dto/create-target-margin.dto";
import { ListTargetMarginsDto } from "./dto/list-target-margins.dto";

/**
 * `hospital_settings.default_target_margin`'s own Prisma default
 * (`schema.prisma`) — the ultimate fallback when a hospital has no
 * `HospitalSettings` row yet (onboarding not finished) and no
 * hospital-scope `target_margins` row either.
 */
const FALLBACK_HOSPITAL_DEFAULT_TARGET_MARGIN = 15;

function periodNotFound(): NotFoundException {
  return new NotFoundException({ code: "PERIOD_NOT_FOUND", message: "Period not found." });
}

function scopeReferenceNotFound(scopeType: TargetMarginScopeType): NotFoundException {
  return new NotFoundException({
    code: "TARGET_MARGIN_SCOPE_NOT_FOUND",
    message: `No ${scopeType} exists with the given scopeId for this hospital.`,
  });
}

function scopeIdMismatch(): BadRequestException {
  return new BadRequestException({
    code: "TARGET_MARGIN_SCOPE_ID_MISMATCH",
    message: "scopeId is required when scopeType is profit_center or service, and must be omitted for hospital.",
  });
}

/**
 * docs/02_DOMAIN_MODEL.md `target_margins`, docs/01_BUSINESS_RULES.md §6.
 * Append-only (create + list only — a "change" is always a new row, the
 * audit trail is `set_by_user_id`/`created_at` themselves). Gated by
 * `tariff.read`/`tariff.write` (docs/04_RBAC.md's "Tariff & Target Margin"
 * row covers both).
 *
 * **Unit convention**: `target_margin` is stored as a percentage (15 means
 * 15%), matching `hospital_settings.default_target_margin`'s own
 * `Decimal(5,2)` column — but `packages/domain/src/formulas.ts`'s
 * `recommendedTariff()` expects `targetMargin` as a 0-1 *fraction* (0.15).
 * `resolveForService()` below returns the raw percentage-scale value;
 * callers computing `recommendedTariff` must divide by 100 first.
 */
@Injectable()
export class TargetMarginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditContextService: AuditContextService
  ) {}

  async create(hospitalId: string, dto: CreateTargetMarginDto, actorUserId: string): Promise<TargetMargin> {
    if (dto.scopeType === TargetMarginScopeType.hospital ? !!dto.scopeId : !dto.scopeId) {
      throw scopeIdMismatch();
    }

    const period = await this.prisma.period.findFirst({ where: { id: dto.effectivePeriodId, hospitalId } });
    if (!period) throw periodNotFound();

    if (dto.scopeType === TargetMarginScopeType.profit_center) {
      const profitCenter = await this.prisma.profitCenter.findFirst({
        where: { id: dto.scopeId, hospitalId, deletedAt: null },
      });
      if (!profitCenter) throw scopeReferenceNotFound(dto.scopeType);
    } else if (dto.scopeType === TargetMarginScopeType.service) {
      const service = await this.prisma.service.findFirst({ where: { id: dto.scopeId, hospitalId, deletedAt: null } });
      if (!service) throw scopeReferenceNotFound(dto.scopeType);
    }

    const created = await this.prisma.targetMargin.create({
      data: {
        hospitalId,
        scopeType: dto.scopeType,
        scopeId: dto.scopeType === TargetMarginScopeType.hospital ? null : dto.scopeId,
        targetMargin: dto.targetMargin,
        effectivePeriodId: dto.effectivePeriodId,
        setByUserId: actorUserId,
      },
    });

    this.auditContextService.record({
      entity: "target_margin",
      action: "target_margin.create",
      entityId: created.id,
      before: null,
      after: {
        scopeType: created.scopeType,
        scopeId: created.scopeId,
        targetMargin: created.targetMargin.toString(),
        effectivePeriodId: created.effectivePeriodId,
      },
    });

    return created;
  }

  async findAll(
    hospitalId: string,
    query: ListTargetMarginsDto
  ): Promise<{ data: TargetMargin[]; meta: PaginationMetaDto }> {
    const where: Prisma.TargetMarginWhereInput = {
      hospitalId,
      ...(query.scopeType ? { scopeType: query.scopeType } : {}),
      ...(query.scopeId ? { scopeId: query.scopeId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.targetMargin.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.targetMargin.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.limit, total) };
  }

  /**
   * Resolves the applicable target margin (percentage scale — see class
   * doc comment) for `serviceId` (under `profitCenterId`) as of `periodId`,
   * per `01_BUSINESS_RULES.md` §6: service row → profit_center row →
   * hospital-scope row → `hospital_settings.default_target_margin`. Each
   * scope level picks its most recent row whose `effectivePeriod.startDate`
   * is on or before the target period's — carry-forward, not an exact
   * `effective_period_id` match (Sprint 6 sub-task 0 design decision).
   */
  async resolveForService(hospitalId: string, periodId: string, serviceId: string, profitCenterId: string): Promise<Decimal> {
    const period = await this.prisma.period.findFirst({ where: { id: periodId, hospitalId } });
    if (!period) throw periodNotFound();

    const [serviceRow, profitCenterRow, hospitalRow, hospitalSettings] = await Promise.all([
      this.latestRowAsOf(hospitalId, TargetMarginScopeType.service, serviceId, period.startDate),
      this.latestRowAsOf(hospitalId, TargetMarginScopeType.profit_center, profitCenterId, period.startDate),
      this.latestRowAsOf(hospitalId, TargetMarginScopeType.hospital, null, period.startDate),
      this.prisma.hospitalSettings.findUnique({ where: { hospitalId } }),
    ]);

    const hospitalDefault =
      hospitalRow?.targetMargin ?? hospitalSettings?.defaultTargetMargin ?? FALLBACK_HOSPITAL_DEFAULT_TARGET_MARGIN;

    return resolveTargetMargin({
      serviceTargetMargin: serviceRow?.targetMargin,
      profitCenterTargetMargin: profitCenterRow?.targetMargin,
      hospitalDefaultTargetMargin: hospitalDefault,
    });
  }

  private latestRowAsOf(
    hospitalId: string,
    scopeType: TargetMarginScopeType,
    scopeId: string | null,
    asOf: Date
  ): Promise<TargetMargin | null> {
    return this.prisma.targetMargin.findFirst({
      where: { hospitalId, scopeType, scopeId, effectivePeriod: { startDate: { lte: asOf } } },
      orderBy: { effectivePeriod: { startDate: "desc" } },
    });
  }
}
