import { Injectable, Logger } from "@nestjs/common";
import { Prisma, Service } from "@prisma/client";
import { allocatedCost, Decimal, driverPercentage, grossProfit, margin, recommendedTariff, tariffGap, unitCost } from "@hpp/domain";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantSessionSql } from "../prisma/tenant-session.sql";
import { TargetMarginService } from "../target-margin/target-margin.service";

export interface ProfitabilityComputeJobData {
  allocationRunId: string;
  hospitalId: string;
  organizationId: string;
  actorUserId: string;
}

/**
 * Sprint 6 sub-tasks 1-2 (docs/09_PROFITABILITY_ENGINE.md,
 * docs/10_UNIT_COST_ENGINE.md): the second stage of the allocation
 * pipeline, chained after `allocation_run` reaches `completed`
 * (`AllocationEngineService` enqueues the `profitability.compute` job that
 * lands here, dispatched by the same `AllocationEngineProcessor`).
 * Materializes one `profitability_results` row per profit center and one
 * `service_unit_costs` row per service, in the same transaction — never
 * computed live. On any failure the run becomes `completed_with_errors`
 * (§3's state-machine extension): the allocation numbers already persisted
 * stay valid, only this stage is flagged.
 */
@Injectable()
export class ProfitabilityEngineService {
  private readonly logger = new Logger(ProfitabilityEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly targetMarginService: TargetMarginService
  ) {}

  processRun(payload: ProfitabilityComputeJobData): Promise<void> {
    return this.tenantContextService.runWithNewStore(async () => {
      this.tenantContextService.set({
        organizationId: payload.organizationId,
        hospitalId: payload.hospitalId,
        userId: payload.actorUserId,
      });
      await this.run(payload);
    });
  }

  private async run(payload: ProfitabilityComputeJobData): Promise<void> {
    const run = await this.prisma.allocationRun.findFirst({
      where: { id: payload.allocationRunId, hospitalId: payload.hospitalId },
    });
    // Idempotency guard: only a freshly `completed` run triggers computation
    // — a re-delivered job for a run that's since moved on (or was never
    // completed) is a no-op, not an error.
    if (!run || run.status !== "completed") {
      this.logger.warn(`Skipping profitability computation for allocation run ${payload.allocationRunId} — not in 'completed' status.`);
      return;
    }

    const alreadyComputed = await this.prisma.profitabilityResult.count({ where: { allocationRunId: run.id } });
    if (alreadyComputed > 0) {
      this.logger.warn(`Skipping profitability computation for allocation run ${run.id} — results already exist.`);
      return;
    }

    try {
      const { rows: profitabilityRows, revenueByProfitCenterId, allocatedByProfitCenterId } = await this.computeProfitabilityRows(
        payload.hospitalId,
        run.id,
        run.periodId
      );
      const unitCostRows = await this.computeServiceUnitCostRows(
        payload.hospitalId,
        run.id,
        run.periodId,
        revenueByProfitCenterId,
        allocatedByProfitCenterId
      );

      this.tenantContextService.setManagedTransaction(true);
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw(tenantSessionSql(this.tenantContextService));
          if (profitabilityRows.length > 0) {
            await tx.profitabilityResult.createMany({ data: profitabilityRows });
          }
          if (unitCostRows.length > 0) {
            await tx.serviceUnitCost.createMany({ data: unitCostRows });
          }
        });
      } finally {
        this.tenantContextService.setManagedTransaction(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Profitability computation failed for allocation run ${run.id}: ${message}`);
      await this.prisma.allocationRun.update({
        where: { id: run.id },
        data: { status: "completed_with_errors", errorMessage: message },
      });
    }
  }

  /**
   * docs/09_PROFITABILITY_ENGINE.md §2: for every profit center in the
   * hospital, `revenue` (from `revenue_entries`), `direct_cost` (from
   * `cost_entries` via `direct`-type cost centers' `profitCenterId` link —
   * Sprint 6 sub-task 0), and `allocated_cost` (from this run's
   * `allocated_costs`, target = profit center) combine into
   * `total_cost`/`gross_profit`/`margin` via the existing
   * `grossProfit`/`margin` formulas. Also returns the raw revenue/allocated
   * maps so `computeServiceUnitCostRows` can reuse them for apportionment
   * instead of re-querying.
   */
  private async computeProfitabilityRows(hospitalId: string, allocationRunId: string, periodId: string) {
    const [profitCenters, revenueSums, directCostCenters, allocatedSums] = await Promise.all([
      this.prisma.profitCenter.findMany({ where: { hospitalId, deletedAt: null }, select: { id: true } }),
      this.prisma.revenueEntry.groupBy({
        by: ["profitCenterId"],
        where: { hospitalId, periodId },
        _sum: { revenue: true },
      }),
      this.prisma.costCenter.findMany({
        where: { hospitalId, type: "direct", profitCenterId: { not: null } },
        select: { id: true, profitCenterId: true },
      }),
      this.prisma.allocatedCost.groupBy({
        by: ["targetProfitCenterId"],
        where: { allocationRunId, targetProfitCenterId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const directCostCenterIds = directCostCenters.map((cc) => cc.id);
    const directCostSums =
      directCostCenterIds.length > 0
        ? await this.prisma.costEntry.groupBy({
            by: ["costCenterId"],
            where: { hospitalId, periodId, costCenterId: { in: directCostCenterIds } },
            _sum: { nominal: true },
          })
        : [];

    const directCostByCostCenterId = new Map(directCostSums.map((s) => [s.costCenterId, s._sum.nominal ?? new Prisma.Decimal(0)]));
    const directCostByProfitCenterId = new Map<string, Prisma.Decimal>();
    for (const cc of directCostCenters) {
      const amount = directCostByCostCenterId.get(cc.id) ?? new Prisma.Decimal(0);
      const existing = directCostByProfitCenterId.get(cc.profitCenterId!) ?? new Prisma.Decimal(0);
      directCostByProfitCenterId.set(cc.profitCenterId!, existing.plus(amount));
    }

    const revenueByProfitCenterId = new Map(revenueSums.map((s) => [s.profitCenterId, s._sum.revenue ?? new Prisma.Decimal(0)]));
    const allocatedByProfitCenterId = new Map(allocatedSums.map((s) => [s.targetProfitCenterId!, s._sum.amount ?? new Prisma.Decimal(0)]));

    const rows = profitCenters.map((pc) => {
      const revenue = revenueByProfitCenterId.get(pc.id) ?? new Prisma.Decimal(0);
      const directCost = directCostByProfitCenterId.get(pc.id) ?? new Prisma.Decimal(0);
      const allocated = allocatedByProfitCenterId.get(pc.id) ?? new Prisma.Decimal(0);
      const totalCost = directCost.plus(allocated);
      const gp = grossProfit(revenue, directCost, allocated);
      const m = margin(gp, revenue);

      return {
        allocationRunId,
        profitCenterId: pc.id,
        revenue: revenue.toFixed(2),
        directCost: directCost.toFixed(2),
        allocatedCost: allocated.toFixed(2),
        totalCost: totalCost.toFixed(2),
        grossProfit: gp.toFixed(2),
        margin: m ? m.toFixed(4) : null,
      };
    });

    return { rows, revenueByProfitCenterId, allocatedByProfitCenterId };
  }

  /**
   * docs/10_UNIT_COST_ENGINE.md §2-3: apportions each profit center's
   * `allocated_cost` to its services by revenue-weighted share
   * (`driverPercentage`/`allocatedCost` — the same generic "share of a
   * total" formulas the allocation engine uses, reused as-is). Confirmed
   * Sprint 6 sub-task 2 design: when a profit center's total revenue is
   * zero the 0/0 ratio is undefined, so this falls back to an equal split
   * across that profit center's services — same "equal-split, never
   * silent" philosophy as `W_DRIVER_ZERO` in Sprint 5, not literally
   * specified by the doc but consistent with it. `serviceDirectCost` is
   * always 0 (`medical_activities` deferred). A single service's invalid
   * target margin (e.g. >= 100%, which would make `recommendedTariff`
   * throw) only nulls that service's `recommendedTariff` — it never fails
   * the whole batch.
   */
  private async computeServiceUnitCostRows(
    hospitalId: string,
    allocationRunId: string,
    periodId: string,
    revenueByProfitCenterId: Map<string, Prisma.Decimal>,
    allocatedByProfitCenterId: Map<string, Prisma.Decimal>
  ) {
    const [services, serviceSums] = await Promise.all([
      this.prisma.service.findMany({
        where: { hospitalId, deletedAt: null },
        select: { id: true, profitCenterId: true, currentTariff: true },
      }),
      this.prisma.revenueEntry.groupBy({
        by: ["serviceId"],
        where: { hospitalId, periodId },
        _sum: { revenue: true, volume: true },
      }),
    ]);

    const revenueByServiceId = new Map(serviceSums.map((s) => [s.serviceId, s._sum.revenue ?? new Prisma.Decimal(0)]));
    const volumeByServiceId = new Map(serviceSums.map((s) => [s.serviceId, s._sum.volume ?? new Prisma.Decimal(0)]));

    const servicesByProfitCenterId = new Map<string, Pick<Service, "id" | "profitCenterId" | "currentTariff">[]>();
    for (const svc of services) {
      const list = servicesByProfitCenterId.get(svc.profitCenterId) ?? [];
      list.push(svc);
      servicesByProfitCenterId.set(svc.profitCenterId, list);
    }

    const rows = [];
    for (const [profitCenterId, servicesInPc] of servicesByProfitCenterId) {
      const profitCenterAllocatedCost = allocatedByProfitCenterId.get(profitCenterId) ?? new Prisma.Decimal(0);
      const profitCenterRevenue = revenueByProfitCenterId.get(profitCenterId) ?? new Prisma.Decimal(0);

      for (const svc of servicesInPc) {
        const serviceRevenue = revenueByServiceId.get(svc.id) ?? new Prisma.Decimal(0);
        const serviceVolume = volumeByServiceId.get(svc.id) ?? new Prisma.Decimal(0);

        const percentage = driverPercentage(serviceRevenue, profitCenterRevenue) ?? new Decimal(1).dividedBy(servicesInPc.length);
        const serviceAllocatedCost = allocatedCost(profitCenterAllocatedCost, percentage);
        const serviceDirectCost = new Prisma.Decimal(0);
        const totalServiceCost = serviceAllocatedCost.plus(serviceDirectCost);
        const uc = unitCost(totalServiceCost, serviceVolume);

        const targetMarginPercent = await this.targetMarginService.resolveForService(hospitalId, periodId, svc.id, profitCenterId);

        let recTariff: Decimal | null = null;
        if (uc !== null) {
          try {
            recTariff = recommendedTariff(uc, targetMarginPercent.dividedBy(100));
          } catch {
            this.logger.warn(
              `Skipping recommendedTariff for service ${svc.id} — target margin ${targetMarginPercent.toString()}% is out of range.`
            );
          }
        }

        rows.push({
          allocationRunId,
          serviceId: svc.id,
          serviceAllocatedCost: serviceAllocatedCost.toFixed(2),
          serviceDirectCost: serviceDirectCost.toFixed(2),
          serviceVolume: serviceVolume.toFixed(2),
          unitCost: uc ? uc.toFixed(4) : null,
          currentTariff: svc.currentTariff ? svc.currentTariff.toFixed(2) : null,
          tariffGap: uc !== null && svc.currentTariff !== null ? tariffGap(svc.currentTariff, uc).toFixed(4) : null,
          targetMarginUsed: targetMarginPercent.toFixed(4),
          recommendedTariff: recTariff ? recTariff.toFixed(4) : null,
        });
      }
    }

    return rows;
  }
}
