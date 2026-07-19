import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AllocatedCost, AllocationRun, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditContextService } from "../audit/audit-context.service";
import { AllocationQueueService } from "../queue/allocation-queue.service";
import { paginationMeta, PaginationMetaDto, PaginationQueryDto } from "../common/dto/pagination.dto";
import { CreateAllocationRunDto } from "./dto/create-allocation-run.dto";
import { ListAllocationRunsDto } from "./dto/list-allocation-runs.dto";

function periodNotFound(): NotFoundException {
  return new NotFoundException({ code: "PERIOD_NOT_FOUND", message: "Period not found." });
}

function runNotFound(): NotFoundException {
  return new NotFoundException({ code: "ALLOCATION_RUN_NOT_FOUND", message: "Allocation run not found." });
}

function notRecalculable(status: string): ConflictException {
  return new ConflictException({
    code: "ALLOCATION_RUN_NOT_RECALCULABLE",
    message: `Allocation run is '${status}' — only 'completed' or 'failed' runs can be recalculated.`,
  });
}

function alreadySuperseded(): ConflictException {
  return new ConflictException({
    code: "ALLOCATION_RUN_ALREADY_SUPERSEDED",
    message: "This allocation run has already been superseded by a later recalculation — recalculate the latest run instead.",
  });
}

function periodNotOpen(label: string, status: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: "PERIOD_NOT_OPEN",
    message: `Cannot recalculate — period '${label}' is '${status}', not open.`,
  });
}

/**
 * `create()` inserts a `draft` row, then enqueues an `allocation.run` job on
 * the dedicated `allocation-engine` BullMQ queue — `AllocationEngineService`
 * (Sprint 5 sub-task 4) picks it up, runs Direct/Step-Down
 * (docs/08_COST_ALLOCATION_ENGINE.md) against real Prisma data, and
 * transitions the run to `completed`/`failed`. Same enqueue-after-create
 * shape as `UploadService.create()`.
 */
@Injectable()
export class AllocationRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditContextService: AuditContextService,
    private readonly allocationQueueService: AllocationQueueService
  ) {}

  async create(
    hospitalId: string,
    organizationId: string,
    dto: CreateAllocationRunDto,
    actorUserId: string
  ): Promise<AllocationRun> {
    const period = await this.prisma.period.findFirst({
      where: { id: dto.periodId, hospitalId, deletedAt: null },
    });
    if (!period) throw periodNotFound();

    const run = await this.prisma.allocationRun.create({
      data: {
        hospitalId,
        periodId: dto.periodId,
        method: dto.method,
        status: "draft",
        createdByUserId: actorUserId,
      },
    });

    this.auditContextService.record({
      entity: "allocation_run",
      action: "allocation_run.create",
      entityId: run.id,
      before: null,
      after: { periodId: run.periodId, method: run.method, status: run.status },
    });

    await this.allocationQueueService.enqueue("allocation.run", {
      allocationRunId: run.id,
      hospitalId,
      organizationId,
      actorUserId,
    });

    return run;
  }

  async findAll(
    hospitalId: string,
    query: ListAllocationRunsDto
  ): Promise<{ data: AllocationRun[]; meta: PaginationMetaDto }> {
    const where: Prisma.AllocationRunWhereInput = {
      hospitalId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.periodId ? { periodId: query.periodId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.allocationRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.allocationRun.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(hospitalId: string, id: string): Promise<AllocationRun> {
    const run = await this.prisma.allocationRun.findFirst({ where: { id, hospitalId } });
    if (!run) throw runNotFound();
    return run;
  }

  async findAllocatedCosts(
    hospitalId: string,
    id: string,
    query: PaginationQueryDto
  ): Promise<{ data: AllocatedCost[]; meta: PaginationMetaDto }> {
    const run = await this.findOne(hospitalId, id);
    const where: Prisma.AllocatedCostWhereInput = { allocationRunId: run.id };
    const [data, total] = await Promise.all([
      this.prisma.allocatedCost.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.allocatedCost.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.limit, total) };
  }

  /**
   * docs/01_BUSINESS_RULES.md §4: never mutates the prior run — always
   * creates a new `draft` row with `supersedesRunId` pointing at it, then
   * enqueues it exactly like `create()`. Only `completed`/`failed` runs are
   * recalculable (a `draft`/`running` run is already mid-flight), the
   * period must still be `open`, and a run that's already been superseded
   * can't be superseded again — recalculate the latest run in the chain
   * instead (enforced by `supersedesRunId`'s own `@unique` constraint, but
   * checked here first for a clear error instead of a raw DB conflict).
   */
  async recalculate(
    hospitalId: string,
    organizationId: string,
    id: string,
    actorUserId: string
  ): Promise<AllocationRun> {
    const prior = await this.prisma.allocationRun.findFirst({ where: { id, hospitalId }, include: { period: true } });
    if (!prior) throw runNotFound();
    if (prior.status !== "completed" && prior.status !== "failed") throw notRecalculable(prior.status);
    if (prior.period.status !== "open") throw periodNotOpen(prior.period.label, prior.period.status);

    const supersededBy = await this.prisma.allocationRun.findFirst({ where: { supersedesRunId: id } });
    if (supersededBy) throw alreadySuperseded();

    const run = await this.prisma.allocationRun.create({
      data: {
        hospitalId,
        periodId: prior.periodId,
        method: prior.method,
        status: "draft",
        supersedesRunId: prior.id,
        createdByUserId: actorUserId,
      },
    });

    this.auditContextService.record({
      entity: "allocation_run",
      action: "allocation_run.recalculate",
      entityId: run.id,
      before: { supersedesRunId: prior.id },
      after: { periodId: run.periodId, method: run.method, status: run.status },
    });

    await this.allocationQueueService.enqueue("allocation.run", {
      allocationRunId: run.id,
      hospitalId,
      organizationId,
      actorUserId,
    });

    return run;
  }
}
