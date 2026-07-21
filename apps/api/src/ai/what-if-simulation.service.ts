import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AllocationRun } from "@prisma/client";
import { Decimal, grossProfit, margin as marginFormula, recommendedTariff, tariffGap as tariffGapFormula, unitCost as unitCostFormula, variance, type VarianceResult } from "@hpp/domain";
import { PrismaService } from "../prisma/prisma.service";
import { WhatIfSimulationRequestDto } from "./dto/what-if-simulation-request.dto";
import {
  WhatIfProfitCenterDeltasDto,
  WhatIfProfitCenterFiguresDto,
  WhatIfServiceDeltasDto,
  WhatIfServiceFiguresDto,
  WhatIfSimulationResponseDto,
} from "./dto/what-if-simulation-response.dto";

function noCompletedRun(): NotFoundException {
  return new NotFoundException({
    code: "NO_COMPLETED_ALLOCATION_RUN",
    message: "No completed, non-stale allocation run exists for this period.",
  });
}

function runNotFound(): NotFoundException {
  return new NotFoundException({ code: "ALLOCATION_RUN_NOT_FOUND", message: "Allocation run not found for this period." });
}

function serviceNotFound(): NotFoundException {
  return new NotFoundException({ code: "SERVICE_NOT_FOUND", message: "Service not found." });
}

function noHypotheticalInput(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: "WHAT_IF_NO_HYPOTHETICAL_INPUT",
    message: "Provide at least one of hypotheticalTariff or hypotheticalVolume.",
  });
}

function noBaselineData(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: "WHAT_IF_NO_BASELINE_DATA",
    message: "This service has no unit-cost/profitability results in the selected run — run Cost Allocation first.",
  });
}

/**
 * docs/12_AI_ENGINE.md §4 — ephemeral, request-scoped, never persisted (no
 * `createMany`/table write anywhere in this file, unlike
 * `ProfitabilityEngineService`). Re-runs the `09_PROFITABILITY_ENGINE.md`/
 * `10_UNIT_COST_ENGINE.md` formulas in-memory against the latest completed
 * run's real data with the caller's hypothetical tariff/volume substituted
 * in — every formula call below is the same `@hpp/domain` function the real
 * engines use (docs/18_FORMULA_REFERENCE.md §2's single-implementation
 * rule), never reimplemented here.
 *
 * Cost mechanics (confirmed design decision, no doc specifies this):
 * `serviceAllocatedCost` stays FIXED — a short-run cost-accounting
 * assumption that one service's hypothetical volume/tariff change doesn't
 * retroactively re-run the revenue-weighted profit-center→service
 * apportionment cascade. Only `serviceDirectCost` scales linearly with the
 * volume ratio (a standard variable-cost assumption). This is a real,
 * material modeling choice — surfaced in the class comment so it's never
 * mistaken for a literal formula-reference guarantee.
 */
@Injectable()
export class WhatIfSimulationService {
  constructor(private readonly prisma: PrismaService) {}

  async simulate(hospitalId: string, dto: WhatIfSimulationRequestDto): Promise<WhatIfSimulationResponseDto> {
    if (dto.hypotheticalTariff === undefined && dto.hypotheticalVolume === undefined) {
      throw noHypotheticalInput();
    }

    const run = await this.resolveRun(hospitalId, dto.periodId, dto.allocationRunId);

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, hospitalId, deletedAt: null },
      select: { id: true, code: true, name: true, profitCenterId: true, profitCenter: { select: { code: true, name: true } } },
    });
    if (!service) throw serviceNotFound();

    const [unitCostRow, profitabilityRow, revenueSum] = await Promise.all([
      this.prisma.serviceUnitCost.findFirst({ where: { allocationRunId: run.id, serviceId: service.id } }),
      this.prisma.profitabilityResult.findFirst({ where: { allocationRunId: run.id, profitCenterId: service.profitCenterId } }),
      this.prisma.revenueEntry.aggregate({
        where: { hospitalId, periodId: run.periodId, serviceId: service.id },
        _sum: { revenue: true },
      }),
    ]);
    if (!unitCostRow || !profitabilityRow) throw noBaselineData();

    const baselineTariff = unitCostRow.currentTariff ?? new Decimal(0);
    const baselineVolume = unitCostRow.serviceVolume;
    const baselineAllocatedCost = unitCostRow.serviceAllocatedCost;
    const baselineDirectCost = unitCostRow.serviceDirectCost;
    const baselineTotalCost = baselineAllocatedCost.plus(baselineDirectCost);
    const baselineUnitCost = unitCostFormula(baselineTotalCost, baselineVolume);
    const baselineRevenue = revenueSum._sum.revenue ?? new Decimal(0);

    const serviceBaseline: WhatIfServiceFiguresDto = {
      tariff: baselineTariff.toFixed(2),
      volume: baselineVolume.toFixed(2),
      allocatedCost: baselineAllocatedCost.toFixed(2),
      directCost: baselineDirectCost.toFixed(2),
      totalCost: baselineTotalCost.toFixed(2),
      unitCost: baselineUnitCost ? baselineUnitCost.toFixed(4) : null,
      tariffGap: baselineUnitCost !== null ? tariffGapFormula(baselineTariff, baselineUnitCost).toFixed(4) : null,
      recommendedTariff: this.safeRecommendedTariff(baselineUnitCost, unitCostRow.targetMarginUsed),
      revenue: baselineRevenue.toFixed(2),
    };

    const newTariff = dto.hypotheticalTariff !== undefined ? new Decimal(dto.hypotheticalTariff) : baselineTariff;
    const newVolume = dto.hypotheticalVolume !== undefined ? new Decimal(dto.hypotheticalVolume) : baselineVolume;
    const volumeRatio = baselineVolume.isZero() ? new Decimal(1) : newVolume.dividedBy(baselineVolume);
    const newDirectCost = baselineDirectCost.times(volumeRatio);
    const newAllocatedCost = baselineAllocatedCost; // held fixed — see class doc comment
    const newTotalCost = newAllocatedCost.plus(newDirectCost);
    const newUnitCost = unitCostFormula(newTotalCost, newVolume);
    const newRevenue = newTariff.times(newVolume);

    const serviceHypothetical: WhatIfServiceFiguresDto = {
      tariff: newTariff.toFixed(2),
      volume: newVolume.toFixed(2),
      allocatedCost: newAllocatedCost.toFixed(2),
      directCost: newDirectCost.toFixed(2),
      totalCost: newTotalCost.toFixed(2),
      unitCost: newUnitCost ? newUnitCost.toFixed(4) : null,
      tariffGap: newUnitCost !== null ? tariffGapFormula(newTariff, newUnitCost).toFixed(4) : null,
      recommendedTariff: this.safeRecommendedTariff(newUnitCost, unitCostRow.targetMarginUsed),
      revenue: newRevenue.toFixed(2),
    };

    const serviceDeltas: WhatIfServiceDeltasDto = {
      revenue: this.toVarianceDto(variance(newRevenue, baselineRevenue), 2),
      totalCost: this.toVarianceDto(variance(newTotalCost, baselineTotalCost), 2),
      unitCost: baselineUnitCost !== null && newUnitCost !== null ? this.toVarianceDto(variance(newUnitCost, baselineUnitCost), 4) : null,
      tariffGap:
        baselineUnitCost !== null && newUnitCost !== null
          ? this.toVarianceDto(
              variance(tariffGapFormula(newTariff, newUnitCost), tariffGapFormula(baselineTariff, baselineUnitCost)),
              4
            )
          : null,
    };

    const pcRevenue = profitabilityRow.revenue;
    const pcDirectCost = profitabilityRow.directCost;
    const pcAllocatedCost = profitabilityRow.allocatedCost;
    const pcTotalCost = pcDirectCost.plus(pcAllocatedCost);
    const pcGrossProfit = grossProfit(pcRevenue, pcDirectCost, pcAllocatedCost);
    const pcMargin = marginFormula(pcGrossProfit, pcRevenue);

    const profitCenterBaseline: WhatIfProfitCenterFiguresDto = {
      revenue: pcRevenue.toFixed(2),
      directCost: pcDirectCost.toFixed(2),
      allocatedCost: pcAllocatedCost.toFixed(2),
      totalCost: pcTotalCost.toFixed(2),
      grossProfit: pcGrossProfit.toFixed(2),
      margin: pcMargin ? pcMargin.toFixed(4) : null,
    };

    // Only this one service's revenue contribution ripples into the profit
    // center — its direct/allocated cost are untouched (see class comment).
    const newPcRevenue = pcRevenue.minus(baselineRevenue).plus(newRevenue);
    const newPcGrossProfit = grossProfit(newPcRevenue, pcDirectCost, pcAllocatedCost);
    const newPcMargin = marginFormula(newPcGrossProfit, newPcRevenue);

    const profitCenterHypothetical: WhatIfProfitCenterFiguresDto = {
      revenue: newPcRevenue.toFixed(2),
      directCost: pcDirectCost.toFixed(2),
      allocatedCost: pcAllocatedCost.toFixed(2),
      totalCost: pcTotalCost.toFixed(2),
      grossProfit: newPcGrossProfit.toFixed(2),
      margin: newPcMargin ? newPcMargin.toFixed(4) : null,
    };

    const profitCenterDeltas: WhatIfProfitCenterDeltasDto = {
      revenue: this.toVarianceDto(variance(newPcRevenue, pcRevenue), 2),
      grossProfit: this.toVarianceDto(variance(newPcGrossProfit, pcGrossProfit), 2),
      margin: pcMargin !== null && newPcMargin !== null ? this.toVarianceDto(variance(newPcMargin, pcMargin), 4) : null,
    };

    return {
      allocationRunId: run.id,
      periodId: run.periodId,
      serviceId: service.id,
      serviceCode: service.code,
      serviceName: service.name,
      profitCenterId: service.profitCenterId,
      profitCenterCode: service.profitCenter.code,
      profitCenterName: service.profitCenter.name,
      serviceBaseline,
      serviceHypothetical,
      serviceDeltas,
      profitCenterBaseline,
      profitCenterHypothetical,
      profitCenterDeltas,
    };
  }

  /** `recommendedTariff()` throws for an out-of-range target margin — a single service's simulation degrading to `null` here must never break the response, same tolerance as `ProfitabilityEngineService`. */
  private safeRecommendedTariff(unitCost: Decimal | null, targetMarginUsed: Decimal): string | null {
    if (unitCost === null) return null;
    try {
      return recommendedTariff(unitCost, targetMarginUsed.dividedBy(100)).toFixed(4);
    } catch {
      return null;
    }
  }

  private toVarianceDto(result: VarianceResult, decimals: number): { absolute: string; percentage: string | null } {
    return { absolute: result.absolute.toFixed(decimals), percentage: result.percentage?.toFixed(4) ?? null };
  }

  /** Same "latest completed, non-stale run unless explicit" contract as `ProfitabilityQueryService`/`DoctorAnalyticsService`. */
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
}
