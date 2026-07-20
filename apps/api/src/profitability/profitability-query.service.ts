import { Injectable, NotFoundException } from "@nestjs/common";
import { AllocationRun } from "@prisma/client";
import { margin as marginFormula, variance as varianceFormula, Decimal } from "@hpp/domain";
import { PrismaService } from "../prisma/prisma.service";
import { ListProfitCentersQueryDto, ProfitabilityQueryDto } from "./dto/profitability-query.dto";
import { ProfitabilitySummaryResponseDto } from "./dto/profitability-summary-response.dto";
import { ProfitCenterProfitabilityResponseDto } from "./dto/profit-center-profitability-response.dto";
import { ServiceUnitCostResponseDto } from "./dto/service-unit-cost-response.dto";
import { ProfitabilityTrendResponseDto } from "./dto/profitability-trend-response.dto";

function noCompletedRun(): NotFoundException {
  return new NotFoundException({
    code: "NO_COMPLETED_ALLOCATION_RUN",
    message: "No completed, non-stale allocation run exists for this period.",
  });
}

function runNotFound(): NotFoundException {
  return new NotFoundException({ code: "ALLOCATION_RUN_NOT_FOUND", message: "Allocation run not found for this period." });
}

function profitCenterNotFound(): NotFoundException {
  return new NotFoundException({ code: "PROFIT_CENTER_NOT_FOUND", message: "Profit center not found." });
}

/**
 * docs/09_PROFITABILITY_ENGINE.md §6, docs/10_UNIT_COST_ENGINE.md §5: reads
 * exclusively from the materialized `profitability_results`/
 * `service_unit_costs` tables — never recomputes. Every method resolves to
 * the latest `completed`, non-stale run for the requested period unless
 * `allocationRunId` is explicitly supplied (historical/audit comparison,
 * read as-is regardless of status/staleness).
 */
@Injectable()
export class ProfitabilityQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(hospitalId: string, query: ProfitabilityQueryDto): Promise<ProfitabilitySummaryResponseDto> {
    const run = await this.resolveRun(hospitalId, query.periodId, query.allocationRunId);
    const results = await this.prisma.profitabilityResult.findMany({ where: { allocationRunId: run.id } });

    const totalRevenue = results.reduce((sum, r) => sum.plus(r.revenue), new Decimal(0));
    const totalCost = results.reduce((sum, r) => sum.plus(r.totalCost), new Decimal(0));
    const totalGrossProfit = results.reduce((sum, r) => sum.plus(r.grossProfit), new Decimal(0));
    const overallMargin = marginFormula(totalGrossProfit, totalRevenue);

    return {
      allocationRunId: run.id,
      periodId: run.periodId,
      profitCenterCount: results.length,
      totalRevenue: totalRevenue.toFixed(2),
      totalCost: totalCost.toFixed(2),
      totalGrossProfit: totalGrossProfit.toFixed(2),
      overallMargin: overallMargin ? overallMargin.toFixed(4) : null,
    };
  }

  /** docs/09_PROFITABILITY_ENGINE.md §4: ranks by margin or gross_profit, user-toggleable. */
  async profitCenters(hospitalId: string, query: ListProfitCentersQueryDto): Promise<ProfitCenterProfitabilityResponseDto> {
    const run = await this.resolveRun(hospitalId, query.periodId, query.allocationRunId);
    const results = await this.prisma.profitabilityResult.findMany({
      where: { allocationRunId: run.id },
      include: { profitCenter: { select: { code: true, name: true } } },
    });

    const sortBy = query.sortBy ?? "margin";
    const order = query.order ?? "desc";
    const sorted = [...results].sort((a, b) => {
      // Null margin (zero-revenue profit center) always sorts last, regardless of order direction.
      const aValue = sortBy === "margin" ? a.margin : a.grossProfit;
      const bValue = sortBy === "margin" ? b.margin : b.grossProfit;
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      const diff = aValue.comparedTo(bValue);
      return order === "asc" ? diff : -diff;
    });

    const trailingTotalCostByProfitCenterId = await this.trailingProfitabilityTotalCosts(hospitalId, run.periodId);

    return {
      allocationRunId: run.id,
      data: sorted.map((r) => {
        const priorTotalCost = trailingTotalCostByProfitCenterId?.get(r.profitCenterId);
        const totalCostVariance = priorTotalCost !== undefined ? varianceFormula(r.totalCost, priorTotalCost) : null;
        return {
          profitCenterId: r.profitCenterId,
          profitCenterCode: r.profitCenter.code,
          profitCenterName: r.profitCenter.name,
          revenue: r.revenue.toFixed(2),
          directCost: r.directCost.toFixed(2),
          allocatedCost: r.allocatedCost.toFixed(2),
          totalCost: r.totalCost.toFixed(2),
          grossProfit: r.grossProfit.toFixed(2),
          margin: r.margin ? r.margin.toFixed(4) : null,
          totalCostVariance: totalCostVariance
            ? { absolute: totalCostVariance.absolute.toFixed(2), percentage: totalCostVariance.percentage?.toFixed(4) ?? null }
            : null,
        };
      }),
    };
  }

  async services(hospitalId: string, query: ProfitabilityQueryDto): Promise<ServiceUnitCostResponseDto> {
    const run = await this.resolveRun(hospitalId, query.periodId, query.allocationRunId);
    const results = await this.prisma.serviceUnitCost.findMany({
      where: { allocationRunId: run.id },
      include: { service: { select: { code: true, name: true, profitCenterId: true } } },
    });

    const trailingUnitCostByServiceId = await this.trailingServiceUnitCosts(hospitalId, run.periodId);

    return {
      allocationRunId: run.id,
      data: results.map((r) => {
        const priorUnitCost = trailingUnitCostByServiceId?.get(r.serviceId);
        const unitCostVariance =
          r.unitCost !== null && priorUnitCost !== undefined && priorUnitCost !== null
            ? varianceFormula(r.unitCost, priorUnitCost)
            : null;
        return {
          serviceId: r.serviceId,
          serviceCode: r.service.code,
          serviceName: r.service.name,
          profitCenterId: r.service.profitCenterId,
          serviceAllocatedCost: r.serviceAllocatedCost.toFixed(2),
          serviceDirectCost: r.serviceDirectCost.toFixed(2),
          serviceVolume: r.serviceVolume.toFixed(2),
          unitCost: r.unitCost ? r.unitCost.toFixed(4) : null,
          currentTariff: r.currentTariff ? r.currentTariff.toFixed(2) : null,
          tariffGap: r.tariffGap ? r.tariffGap.toFixed(4) : null,
          targetMarginUsed: r.targetMarginUsed.toFixed(4),
          recommendedTariff: r.recommendedTariff ? r.recommendedTariff.toFixed(4) : null,
          unitCostVariance: unitCostVariance
            ? { absolute: unitCostVariance.absolute.toFixed(4), percentage: unitCostVariance.percentage?.toFixed(4) ?? null }
            : null,
        };
      }),
    };
  }

  /**
   * docs/09_PROFITABILITY_ENGINE.md §4: one point per period's
   * latest-completed-run result for this profit center; a period with no
   * completed run is omitted entirely (a gap, never interpolated/zero-filled).
   */
  async trends(hospitalId: string, profitCenterId: string): Promise<ProfitabilityTrendResponseDto> {
    const profitCenter = await this.prisma.profitCenter.findFirst({
      where: { id: profitCenterId, hospitalId, deletedAt: null },
    });
    if (!profitCenter) throw profitCenterNotFound();

    const periods = await this.prisma.period.findMany({ where: { hospitalId }, orderBy: { startDate: "asc" } });

    const points = await Promise.all(
      periods.map(async (period) => {
        const run = await this.prisma.allocationRun.findFirst({
          where: { hospitalId, periodId: period.id, status: "completed", isStale: false },
          orderBy: { createdAt: "desc" },
        });
        if (!run) return null;

        const result = await this.prisma.profitabilityResult.findFirst({ where: { allocationRunId: run.id, profitCenterId } });
        if (!result) return null;

        return {
          periodId: period.id,
          periodLabel: period.label,
          allocationRunId: run.id,
          revenue: result.revenue.toFixed(2),
          grossProfit: result.grossProfit.toFixed(2),
          margin: result.margin ? result.margin.toFixed(4) : null,
        };
      })
    );

    return { profitCenterId, data: points.filter((p): p is NonNullable<typeof p> => p !== null) };
  }

  private async resolveRun(hospitalId: string, periodId: string, allocationRunId?: string): Promise<AllocationRun> {
    if (allocationRunId) {
      const run = await this.prisma.allocationRun.findFirst({ where: { id: allocationRunId, hospitalId, periodId } });
      if (!run) throw runNotFound();
      return run;
    }

    const run = await this.prisma.allocationRun.findFirst({
      where: { hospitalId, periodId, status: "completed", isStale: false },
      orderBy: { createdAt: "desc" },
    });
    if (!run) throw noCompletedRun();
    return run;
  }

  /**
   * docs/09_PROFITABILITY_ENGINE.md §5: "trailing period" = the period with
   * the next-earlier `startDate` for this hospital, not a fixed prior year.
   * Returns null when there's no trailing period at all, or it has no
   * completed non-stale run — either way, every row's variance is null
   * (a gap, same "never zero-filled" philosophy as `trends()`).
   */
  private async resolveTrailingRun(hospitalId: string, currentPeriodId: string): Promise<AllocationRun | null> {
    const currentPeriod = await this.prisma.period.findFirst({ where: { id: currentPeriodId, hospitalId } });
    if (!currentPeriod) return null;

    const trailingPeriod = await this.prisma.period.findFirst({
      where: { hospitalId, startDate: { lt: currentPeriod.startDate } },
      orderBy: { startDate: "desc" },
    });
    if (!trailingPeriod) return null;

    return this.prisma.allocationRun.findFirst({
      where: { hospitalId, periodId: trailingPeriod.id, status: "completed", isStale: false },
      orderBy: { createdAt: "desc" },
    });
  }

  private async trailingProfitabilityTotalCosts(hospitalId: string, currentPeriodId: string): Promise<Map<string, Decimal> | null> {
    const trailingRun = await this.resolveTrailingRun(hospitalId, currentPeriodId);
    if (!trailingRun) return null;
    const results = await this.prisma.profitabilityResult.findMany({ where: { allocationRunId: trailingRun.id } });
    return new Map(results.map((r) => [r.profitCenterId, r.totalCost]));
  }

  private async trailingServiceUnitCosts(hospitalId: string, currentPeriodId: string): Promise<Map<string, Decimal | null> | null> {
    const trailingRun = await this.resolveTrailingRun(hospitalId, currentPeriodId);
    if (!trailingRun) return null;
    const results = await this.prisma.serviceUnitCost.findMany({ where: { allocationRunId: trailingRun.id } });
    return new Map(results.map((r) => [r.serviceId, r.unitCost]));
  }
}
