import { Injectable, NotFoundException } from "@nestjs/common";
import { AllocationRun } from "@prisma/client";
import {
  Decimal,
  margin as marginFormula,
  cohortDistribution,
  percentileBand,
  type CohortDistribution,
  type PercentileBand,
} from "@hpp/domain";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { DoctorAnalyticsQueryDto, DoctorComparisonQueryDto } from "./dto/doctor-analytics-query.dto";
import { DoctorAnalyticsSummaryResponseDto, DoctorAnalyticsSummaryRowDto } from "./dto/doctor-analytics-summary-response.dto";
import { CohortDistributionDto } from "./dto/cohort-distribution.dto";
import {
  ComparisonFactorDto,
  DoctorComparisonAggregateResponseDto,
  DoctorComparisonIdentifiedResponseDto,
} from "./dto/doctor-comparison-response.dto";

const MINIMUM_SAMPLE_SIZE = 5;
const READ_DETAIL_PERMISSION = "doctor_analytics.read_detail";

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

interface DoctorActivityAggregate {
  doctorId: string;
  volume: Decimal;
  caseCount: number;
  avgBmhpCost: Decimal | null;
  avgDurationMinutes: Decimal | null;
  avgRoomCost: Decimal | null;
  avgStaffCost: Decimal | null;
}

/**
 * docs/11_DOCTOR_ANALYTICS.md §4-§5: reads exclusively from the
 * materialized `doctor_profitability_results` (never recomputes — same
 * "read from materialized results only" convention as
 * `ProfitabilityQueryService`) plus `medical_activities` for the per-doctor
 * volume/case-count/factor breakdown that isn't stored on
 * `doctor_profitability_results` itself. The RBAC masking decision (detail
 * vs. aggregate shape) happens here, not in the controller — no precedent
 * in this codebase for a controller branching response shape by
 * permission, but `PermissionsService.getPermissionCodesForRoleName()` is
 * already the exact method `PermissionsGuard` itself uses.
 */
@Injectable()
export class DoctorAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService
  ) {}

  async summary(hospitalId: string, query: DoctorAnalyticsQueryDto): Promise<DoctorAnalyticsSummaryResponseDto> {
    const run = await this.resolveRun(hospitalId, query.periodId, query.allocationRunId);
    const results = await this.prisma.doctorProfitabilityResult.findMany({
      where: { allocationRunId: run.id },
      include: { service: { select: { code: true, name: true } } },
    });
    if (results.length === 0) return { allocationRunId: run.id, periodId: run.periodId, data: [] };

    const activityByDoctorService = await this.fetchActivityAggregates(hospitalId, run.periodId, {
      serviceId: { in: [...new Set(results.map((r) => r.serviceId))] },
    });

    const byServiceId = new Map<string, typeof results>();
    for (const row of results) {
      const list = byServiceId.get(row.serviceId) ?? [];
      list.push(row);
      byServiceId.set(row.serviceId, list);
    }

    const data: DoctorAnalyticsSummaryRowDto[] = [...byServiceId.entries()].map(([serviceId, rows]) => {
      const totalRevenue = rows.reduce((sum, r) => sum.plus(r.revenue), new Decimal(0));
      const totalCost = rows.reduce((sum, r) => sum.plus(r.cost), new Decimal(0));
      const totalProfit = rows.reduce((sum, r) => sum.plus(r.profit), new Decimal(0));
      const overallMargin = marginFormula(totalProfit, totalRevenue);

      const metrics = rows.map((r) => {
        const activity = activityByDoctorService.get(`${r.doctorId}:${serviceId}`);
        return { caseCount: activity?.caseCount ?? 0, unitCostEquivalent: this.unitCostEquivalent(r.cost, activity?.volume) };
      });
      const cohortValues = metrics.filter((m) => m.unitCostEquivalent !== null).map((m) => m.unitCostEquivalent!);
      const cohort = cohortDistribution(cohortValues);

      return {
        serviceId,
        serviceCode: rows[0]!.service.code,
        serviceName: rows[0]!.service.name,
        doctorCount: rows.length,
        totalRevenue: totalRevenue.toFixed(2),
        totalCost: totalCost.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        overallMargin: overallMargin ? overallMargin.toFixed(4) : null,
        cohort: cohort ? this.toCohortDto(cohort) : null,
        doctorsAboveP90Count: cohort ? this.countInBand(metrics, cohort, "above_p90") : 0,
        doctorsBelowP25Count: cohort ? this.countInBand(metrics, cohort, "below_p25") : 0,
        insufficientSampleDoctorCount: metrics.filter((m) => m.caseCount < MINIMUM_SAMPLE_SIZE).length,
      };
    });

    return { allocationRunId: run.id, periodId: run.periodId, data };
  }

  async comparison(
    hospitalId: string,
    serviceId: string,
    query: DoctorComparisonQueryDto,
    callerRoleName: string | null
  ): Promise<DoctorComparisonIdentifiedResponseDto | DoctorComparisonAggregateResponseDto> {
    const run = await this.resolveRun(hospitalId, query.periodId, query.allocationRunId);
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, hospitalId, deletedAt: null } });
    if (!service) throw serviceNotFound();

    const results = await this.prisma.doctorProfitabilityResult.findMany({
      where: { allocationRunId: run.id, serviceId },
      include: { doctor: { select: { code: true, name: true } } },
    });
    const activityByDoctorService = await this.fetchActivityAggregates(hospitalId, run.periodId, { serviceId });

    const metrics = results.map((r) => {
      const activity = activityByDoctorService.get(`${r.doctorId}:${serviceId}`);
      return {
        doctorId: r.doctorId,
        doctorCode: r.doctor.code,
        doctorName: r.doctor.name,
        cost: r.cost,
        caseCount: activity?.caseCount ?? 0,
        volume: activity?.volume ?? new Decimal(0),
        unitCostEquivalent: this.unitCostEquivalent(r.cost, activity?.volume),
        activity,
      };
    });
    const cohortValues = metrics.filter((m) => m.unitCostEquivalent !== null).map((m) => m.unitCostEquivalent!);
    const cohort = cohortDistribution(cohortValues);

    const hasDetailAccess = await this.hasReadDetailPermission(hospitalId, callerRoleName);

    if (hasDetailAccess && query.doctorId) {
      const target = metrics.find((m) => m.doctorId === query.doctorId);
      if (!target) throw new NotFoundException({ code: "DOCTOR_NOT_FOUND_FOR_SERVICE", message: "This doctor has no activity for this service in this run." });

      const sufficientSample = target.caseCount >= MINIMUM_SAMPLE_SIZE;
      const band = cohort && sufficientSample && target.unitCostEquivalent ? percentileBand(target.unitCostEquivalent, cohort) : null;
      const totalCostDelta =
        cohort && target.unitCostEquivalent ? target.unitCostEquivalent.minus(cohort.median).times(target.volume) : null;

      return {
        serviceId,
        serviceCode: service.code,
        serviceName: service.name,
        allocationRunId: run.id,
        periodId: run.periodId,
        doctorId: target.doctorId,
        doctorCode: target.doctorCode,
        doctorName: target.doctorName,
        caseCount: target.caseCount,
        sufficientSample,
        unitCostEquivalent: target.unitCostEquivalent?.toFixed(4) ?? null,
        cohort: cohort ? this.toCohortDto(cohort) : this.emptyCohortDto(),
        percentileBand: band,
        totalCostDelta: totalCostDelta?.toFixed(2) ?? null,
        factors: this.buildFactors(target.activity, [...activityByDoctorService.values()].filter((a) => a !== undefined)),
        insufficientDataReason: sufficientSample ? null : `Fewer than ${MINIMUM_SAMPLE_SIZE} cases this period.`,
      };
    }

    const bandNames: PercentileBand[] = ["below_p25", "p25_p75", "p75_p90", "above_p90"];
    const sufficientMetrics = metrics.filter((m) => m.caseCount >= MINIMUM_SAMPLE_SIZE && m.unitCostEquivalent !== null);
    const bands = bandNames.map((band) => ({
      band,
      doctorCount: cohort ? sufficientMetrics.filter((m) => percentileBand(m.unitCostEquivalent!, cohort) === band).length : 0,
    }));

    return {
      serviceId,
      serviceCode: service.code,
      serviceName: service.name,
      allocationRunId: run.id,
      periodId: run.periodId,
      cohort: cohort ? this.toCohortDto(cohort) : this.emptyCohortDto(),
      bands,
      insufficientDataDoctorCount: metrics.filter((m) => m.caseCount < MINIMUM_SAMPLE_SIZE).length,
    };
  }

  private async hasReadDetailPermission(hospitalId: string, roleName: string | null): Promise<boolean> {
    const grantedCodes = await this.permissionsService.getPermissionCodesForRoleName(hospitalId, roleName);
    return grantedCodes.includes(READ_DETAIL_PERMISSION);
  }

  private unitCostEquivalent(cost: Decimal, volume: Decimal | undefined): Decimal | null {
    if (!volume || volume.isZero()) return null;
    return new Decimal(cost).dividedBy(volume);
  }

  private countInBand(
    metrics: { unitCostEquivalent: Decimal | null }[],
    cohort: CohortDistribution,
    band: PercentileBand
  ): number {
    return metrics.filter((m) => m.unitCostEquivalent !== null && percentileBand(m.unitCostEquivalent, cohort) === band).length;
  }

  /**
   * docs/11_DOCTOR_ANALYTICS.md §4's four contributing factors. `cohortMedian`
   * is the median of every doctor's own average for that factor (not
   * re-deriving from raw rows — the per-doctor `_avg` already computed by
   * `fetchActivityAggregates`'s groupBy is the right grain).
   */
  private buildFactors(target: DoctorActivityAggregate | undefined, cohortActivities: DoctorActivityAggregate[]): ComparisonFactorDto[] {
    const factorDefs: { factor: string; get: (a: DoctorActivityAggregate) => Decimal | null }[] = [
      { factor: "bmhp_cost", get: (a) => a.avgBmhpCost },
      { factor: "duration_minutes", get: (a) => a.avgDurationMinutes },
      { factor: "room_cost", get: (a) => a.avgRoomCost },
      { factor: "staff_cost", get: (a) => a.avgStaffCost },
    ];
    return factorDefs.map(({ factor, get }) => {
      const doctorAvg = target ? get(target) : null;
      const cohortValues = cohortActivities.map(get).filter((v): v is Decimal => v !== null);
      const cohortMedian = cohortValues.length > 0 ? cohortDistribution(cohortValues)!.median : null;
      const delta = doctorAvg && cohortMedian ? doctorAvg.minus(cohortMedian) : null;
      return {
        factor,
        doctorAvg: doctorAvg?.toFixed(2) ?? null,
        cohortMedian: cohortMedian?.toFixed(2) ?? null,
        delta: delta?.toFixed(2) ?? null,
      };
    });
  }

  /**
   * Per-(doctor, service) volume/case-count/factor averages — not stored on
   * `doctor_profitability_results` (only `avgDuration`/`avgBmhp` are, per
   * the literal schema), so read straight from `medical_activities` for the
   * run's period, scoped by an arbitrary extra `serviceId` filter (single
   * value for `comparison()`, `{in: [...]}` for `summary()`).
   */
  private async fetchActivityAggregates(
    hospitalId: string,
    periodId: string,
    serviceFilter: { serviceId: string } | { serviceId: { in: string[] } }
  ): Promise<Map<string, DoctorActivityAggregate>> {
    const groups = await this.prisma.medicalActivity.groupBy({
      by: ["doctorId", "serviceId"],
      where: { hospitalId, periodId, ...serviceFilter },
      _sum: { volume: true },
      _count: { _all: true },
      _avg: { bmhpCost: true, durationMinutes: true, roomCost: true, staffCost: true },
    });
    return new Map(
      groups.map((g) => [
        `${g.doctorId}:${g.serviceId}`,
        {
          doctorId: g.doctorId,
          volume: new Decimal(g._sum.volume ?? 0),
          caseCount: g._count._all,
          avgBmhpCost: g._avg.bmhpCost !== null ? new Decimal(g._avg.bmhpCost) : null,
          avgDurationMinutes: g._avg.durationMinutes !== null ? new Decimal(g._avg.durationMinutes) : null,
          avgRoomCost: g._avg.roomCost !== null ? new Decimal(g._avg.roomCost) : null,
          avgStaffCost: g._avg.staffCost !== null ? new Decimal(g._avg.staffCost) : null,
        },
      ])
    );
  }

  private toCohortDto(cohort: CohortDistribution): CohortDistributionDto {
    return {
      median: cohort.median.toFixed(4),
      p25: cohort.p25.toFixed(4),
      p75: cohort.p75.toFixed(4),
      p90: cohort.p90.toFixed(4),
      doctorCount: cohort.doctorCount,
    };
  }

  private emptyCohortDto(): CohortDistributionDto {
    return { median: "0.0000", p25: "0.0000", p75: "0.0000", p90: "0.0000", doctorCount: 0 };
  }

  /** Same "latest completed, non-stale run unless explicit" contract as `ProfitabilityQueryService.resolveRun()`. */
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
