import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Period, PeriodStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditContextService } from "../audit/audit-context.service";
import { paginationMeta, PaginationMetaDto } from "../common/dto/pagination.dto";
import { GeneratePeriodsDto } from "./dto/generate-periods.dto";
import { ReopenPeriodDto } from "./dto/reopen-period.dto";
import { ListPeriodsDto } from "./dto/list-periods.dto";

const MONTHS_PER_FISCAL_YEAR = 12;

function notFound(): NotFoundException {
  return new NotFoundException({ code: "PERIOD_NOT_FOUND", message: "Period not found." });
}

function invalidTransition(from: PeriodStatus, to: string): ConflictException {
  return new ConflictException({
    code: "PERIOD_INVALID_TRANSITION",
    message: `Cannot transition a period from '${from}' to '${to}'.`,
  });
}

/**
 * Period lifecycle (docs/25_PERIOD_CLOSING.md §1): draft -> open -> locked ->
 * closed, plus reopen (locked|closed -> open) as a separate, more sensitive
 * action gated by its own permission (`period_closing.reopen`, System Admin
 * only) rather than `period_closing.write` (generate/open/lock/close, System
 * Admin and CFO/Finance Director).
 *
 * Not built on `MasterDataCrudService`: periods have no create/update DTO
 * shape a generic engine could map 1:1 — `generate()` batch-creates a fiscal
 * year at once, and every other mutation is a named state transition, not a
 * field-level update. Closer in shape to `TariffService`'s hand-rolled
 * `create()` than to a generic CRUD entity.
 *
 * The `draft -> open` transition here is always the manual escape hatch
 * (`25_PERIOD_CLOSING.md` §1: "...or manually by System Admin for hospitals
 * wanting to prepare a period ahead of time"). Automatic draft->open at the
 * start of a period's date range needs a scheduler, which doesn't exist
 * until BullMQ is wired in (Sprint 4 sub-task 2) — tracked as a follow-up,
 * not implemented here.
 */
@Injectable()
export class PeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditContextService: AuditContextService
  ) {}

  /**
   * Creates 12 consecutive monthly `draft` periods for the fiscal year
   * starting in `dto.fiscalYear`, grained by
   * `hospital_settings.fiscal_year_start_month` (defaults to January if no
   * settings row exists yet, matching that column's own Prisma default).
   * All-or-nothing: if any of the 12 labels already exists for this
   * hospital, none are created.
   */
  async generate(hospitalId: string, dto: GeneratePeriodsDto, actorUserId: string): Promise<Period[]> {
    const settings = await this.prisma.hospitalSettings.findUnique({ where: { hospitalId } });
    const startMonth = settings?.fiscalYearStartMonth ?? 1;

    const candidates = Array.from({ length: MONTHS_PER_FISCAL_YEAR }, (_, offset) => {
      // `Date.UTC` normalizes month overflow/underflow itself (month index
      // 12 becomes January of the next year), so this correctly rolls the
      // label's year forward for a non-January fiscal-year start.
      const monthIndex = startMonth - 1 + offset;
      const startDate = new Date(Date.UTC(dto.fiscalYear, monthIndex, 1));
      const endDate = new Date(Date.UTC(dto.fiscalYear, monthIndex + 1, 1));
      const label = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`;
      return { label, startDate, endDate };
    });

    try {
      const created = await this.prisma.period.createManyAndReturn({
        data: candidates.map((c) => ({
          hospitalId,
          label: c.label,
          startDate: c.startDate,
          endDate: c.endDate,
          status: "draft",
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        })),
      });

      this.auditContextService.record({
        entity: "period",
        action: "period.generate",
        entityId: null,
        before: null,
        after: { labels: candidates.map((c) => c.label) },
      });

      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "PERIOD_ALREADY_EXISTS",
          message: `One or more periods already exist for this hospital in fiscal year ${dto.fiscalYear}.`,
        });
      }
      throw error;
    }
  }

  async findAll(
    hospitalId: string,
    query: ListPeriodsDto
  ): Promise<{ data: Period[]; meta: PaginationMetaDto }> {
    const where: Prisma.PeriodWhereInput = {
      hospitalId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.period.findMany({
        where,
        orderBy: { startDate: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.period.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(hospitalId: string, id: string): Promise<Period> {
    const period = await this.prisma.period.findFirst({ where: { id, hospitalId, deletedAt: null } });
    if (!period) throw notFound();
    return period;
  }

  open(hospitalId: string, id: string, actorUserId: string): Promise<Period> {
    return this.transition(hospitalId, id, actorUserId, "draft", "open", "period.open", {});
  }

  lock(hospitalId: string, id: string, actorUserId: string): Promise<Period> {
    return this.transition(hospitalId, id, actorUserId, "open", "locked", "period.lock", { lockedAt: new Date() });
  }

  close(hospitalId: string, id: string, actorUserId: string): Promise<Period> {
    return this.transition(hospitalId, id, actorUserId, "locked", "closed", "period.close", {
      closedAt: new Date(),
    });
  }

  /** locked|closed -> open. `dto.reason` is stored on the audit entry (docs/25_PERIOD_CLOSING.md §2). */
  async reopen(hospitalId: string, id: string, dto: ReopenPeriodDto, actorUserId: string): Promise<Period> {
    const before = await this.findOne(hospitalId, id);
    if (before.status !== "locked" && before.status !== "closed") {
      throw invalidTransition(before.status, "open (reopen)");
    }

    const after = await this.prisma.period.update({
      where: { id },
      data: { status: "open", reopenedAt: new Date(), updatedByUserId: actorUserId },
    });

    this.auditContextService.record({
      entity: "period",
      action: "period.reopen",
      entityId: id,
      before: { status: before.status },
      after: { status: after.status, reason: dto.reason },
    });
    return after;
  }

  private async transition(
    hospitalId: string,
    id: string,
    actorUserId: string,
    fromStatus: PeriodStatus,
    toStatus: PeriodStatus,
    action: string,
    extraData: Record<string, unknown>
  ): Promise<Period> {
    const before = await this.findOne(hospitalId, id);
    if (before.status !== fromStatus) {
      throw invalidTransition(before.status, toStatus);
    }

    const after = await this.prisma.period.update({
      where: { id },
      data: { status: toStatus, updatedByUserId: actorUserId, ...extraData },
    });

    this.auditContextService.record({
      entity: "period",
      action,
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
    });
    return after;
  }
}
