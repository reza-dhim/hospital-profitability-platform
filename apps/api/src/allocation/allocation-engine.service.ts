import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  allocateDirect,
  allocateStepDown,
  reconcileAllocation,
  CycleDetectedError,
  type DirectCostCenterInput,
  type StepDownCostCenterInput,
  type DriverValueInput,
  type TargetRef,
} from "@hpp/domain";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantSessionSql } from "../prisma/tenant-session.sql";
import { AllocationQueueService } from "../queue/allocation-queue.service";

export interface AllocationRunJobData {
  allocationRunId: string;
  hospitalId: string;
  organizationId: string;
  actorUserId: string;
}

function driverValueTarget(dv: { targetCostCenterId: string | null; targetProfitCenterId: string | null }): TargetRef {
  // Same "exactly one set" invariant the DB CHECK constraint enforces on
  // driver_values — one of the two is always non-null.
  return dv.targetCostCenterId
    ? { type: "cost_center", costCenterId: dv.targetCostCenterId }
    : { type: "profit_center", profitCenterId: dv.targetProfitCenterId! };
}

/**
 * Sprint 5 sub-task 4: wires the pure `allocateDirect`/`allocateStepDown`
 * engine (`@hpp/domain`) to real Prisma data. Runs inside a BullMQ worker
 * (`allocation-engine` queue, separate from `upload-pipeline` — see
 * `queue.constants.ts`), same "no HTTP request, open your own tenant
 * context store from the job payload" shape as `ParseService`/
 * `ValidateService`. Does not call `AuditContextService.record()` for the
 * same reason those two don't: it's a no-op outside a request
 * `AuditInterceptor` opened a store for, and there is none here.
 */
@Injectable()
export class AllocationEngineService {
  private readonly logger = new Logger(AllocationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly allocationQueueService: AllocationQueueService
  ) {}

  processRun(payload: AllocationRunJobData): Promise<void> {
    return this.tenantContextService.runWithNewStore(async () => {
      this.tenantContextService.set({
        organizationId: payload.organizationId,
        hospitalId: payload.hospitalId,
        userId: payload.actorUserId,
      });
      await this.run(payload);
    });
  }

  private async run(payload: AllocationRunJobData): Promise<void> {
    const run = await this.prisma.allocationRun.findFirst({
      where: { id: payload.allocationRunId, hospitalId: payload.hospitalId },
      include: { period: true },
    });
    // Idempotency guard: a run already past `draft` (re-delivered job, manual re-run) is a no-op, not an error.
    if (!run || run.status !== "draft") {
      this.logger.warn(`Skipping allocation run ${payload.allocationRunId} — not in 'draft' status.`);
      return;
    }

    // docs/01_BUSINESS_RULES.md §4: recalculation only permitted while the
    // period is 'open' — re-checked here (not just at POST /allocation-runs
    // time) since a period can close between run creation and job
    // execution, same re-check-at-the-point-of-effect pattern as
    // ConfirmService's period-open check inside its own transaction.
    if (run.period.status !== "open") {
      await this.failRun(run.id, `Cannot run allocation — period '${run.period.label}' is '${run.period.status}', not open.`);
      return;
    }

    await this.prisma.allocationRun.update({ where: { id: run.id }, data: { status: "running", startedAt: new Date() } });

    const rules = await this.prisma.allocationRule.findMany({
      where: { hospitalId: payload.hospitalId, method: run.method, effectivePeriod: run.period.label, deletedAt: null },
      select: { costCenterId: true, driverId: true, priority: true },
    });
    if (rules.length === 0) {
      await this.failRun(
        run.id,
        `No allocation rules configured for method '${run.method}' in period '${run.period.label}'.`
      );
      return;
    }

    const [directCostSums, profitCenters, driverValueRows] = await Promise.all([
      this.prisma.costEntry.groupBy({
        by: ["costCenterId"],
        where: { hospitalId: payload.hospitalId, periodId: run.periodId },
        _sum: { nominal: true },
      }),
      this.prisma.profitCenter.findMany({ where: { hospitalId: payload.hospitalId, deletedAt: null }, select: { id: true } }),
      this.prisma.driverValue.findMany({
        where: { hospitalId: payload.hospitalId, periodId: run.periodId },
        select: { driverId: true, targetCostCenterId: true, targetProfitCenterId: true, value: true },
      }),
    ]);

    const directCostByCostCenter = new Map(directCostSums.map((s) => [s.costCenterId, s._sum.nominal ?? new Prisma.Decimal(0)]));
    const profitCenterIds = profitCenters.map((pc) => pc.id);
    const driverValues: DriverValueInput[] = driverValueRows.map((dv) => ({
      driverId: dv.driverId,
      target: driverValueTarget(dv),
      value: dv.value,
    }));

    const costCenters: (DirectCostCenterInput & { priority: number })[] = rules.map((rule) => ({
      costCenterId: rule.costCenterId,
      directCost: directCostByCostCenter.get(rule.costCenterId) ?? new Prisma.Decimal(0),
      driverId: rule.driverId,
      priority: rule.priority,
    }));

    let result: { entries: { sourceCostCenterId: string; target: TargetRef; driverId: string; amount: Prisma.Decimal }[]; warnings: { code: "W_DRIVER_ZERO"; costCenterId: string; driverId: string }[] };
    try {
      result =
        run.method === "direct"
          ? allocateDirect(costCenters, profitCenterIds, driverValues)
          : allocateStepDown(costCenters as StepDownCostCenterInput[], profitCenterIds, driverValues);
    } catch (error) {
      if (error instanceof CycleDetectedError) {
        await this.failRun(run.id, error.message);
        return;
      }
      throw error;
    }

    const mismatches = reconcileAllocation(costCenters, result.entries);
    if (mismatches.length > 0) {
      const detail = mismatches
        .map((m) => `${m.costCenterId}: expected ${m.expectedPool.toString()}, allocated ${m.actualAllocated.toString()}`)
        .join("; ");
      await this.failRun(run.id, `Allocation reconciliation failed: ${detail}`);
      return;
    }

    this.tenantContextService.setManagedTransaction(true);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(tenantSessionSql(this.tenantContextService));

        if (result.entries.length > 0) {
          await tx.allocatedCost.createMany({
            data: result.entries.map((entry) => ({
              allocationRunId: run.id,
              sourceCostCenterId: entry.sourceCostCenterId,
              targetCostCenterId: entry.target.type === "cost_center" ? entry.target.costCenterId : null,
              targetProfitCenterId: entry.target.type === "profit_center" ? entry.target.profitCenterId : null,
              driverId: entry.driverId,
              amount: entry.amount.toFixed(2),
            })),
          });
        }

        await tx.allocationRun.update({
          where: { id: run.id },
          data: {
            status: "completed",
            finishedAt: new Date(),
            ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
          },
        });
      });
    } finally {
      this.tenantContextService.setManagedTransaction(false);
    }

    // docs/09_PROFITABILITY_ENGINE.md §3: profitability computation is the
    // next stage of the same pipeline, triggered by this run reaching
    // `completed` — not run inline here, so a slow/failing profitability
    // computation can never hold up or fail the allocation transaction
    // itself.
    await this.allocationQueueService.enqueue("profitability.compute", {
      allocationRunId: run.id,
      hospitalId: payload.hospitalId,
      organizationId: payload.organizationId,
      actorUserId: payload.actorUserId,
    });
  }

  private async failRun(id: string, message: string): Promise<void> {
    this.logger.warn(`Allocation run ${id} failed: ${message}`);
    await this.prisma.allocationRun.update({
      where: { id },
      data: { status: "failed", errorMessage: message, finishedAt: new Date() },
    });
  }
}
