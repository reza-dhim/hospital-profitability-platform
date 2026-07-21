import { Injectable, NotFoundException } from "@nestjs/common";
import { AllocationRun } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { ProfitabilityQueryService } from "../profitability/profitability-query.service";
import { DoctorAnalyticsService } from "../doctor-analytics/doctor-analytics.service";
import { ProfitCenterProfitabilityRowDto } from "../profitability/dto/profit-center-profitability-response.dto";
import { ServiceUnitCostRowDto } from "../profitability/dto/service-unit-cost-response.dto";
import { DoctorAnalyticsSummaryRowDto } from "../doctor-analytics/dto/doctor-analytics-summary-response.dto";
import { DoctorComparisonIdentifiedResponseDto } from "../doctor-analytics/dto/doctor-comparison-response.dto";

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

export interface TrendPoint {
  periodLabel: string;
  revenue: string;
  cost: string;
  margin: string | null;
}

export interface ExecutiveSummaryData {
  hospitalName: string;
  periodLabel: string;
  allocationRunId: string;
  generatedAt: Date;
  totalRevenue: string;
  totalCost: string;
  totalGrossProfit: string;
  overallMargin: string | null;
  trend: TrendPoint[];
  topProfitCenters: ProfitCenterProfitabilityRowDto[];
  bottomProfitCenters: ProfitCenterProfitabilityRowDto[];
}

export interface ProfitabilityDetailData {
  hospitalName: string;
  periodLabel: string;
  allocationRunId: string;
  generatedAt: Date;
  profitCenters: ProfitCenterProfitabilityRowDto[];
  servicesByProfitCenterId: Map<string, ServiceUnitCostRowDto[]>;
  allServices: ServiceUnitCostRowDto[];
}

export interface DoctorAnalyticsData {
  hospitalName: string;
  periodLabel: string;
  allocationRunId: string;
  generatedAt: Date;
  hasDetailAccess: boolean;
  summaryRows: DoctorAnalyticsSummaryRowDto[];
  identifiedByServiceId: Map<string, DoctorComparisonIdentifiedResponseDto[]>;
}

/**
 * docs/15_REPORTING.md §1's three report types, assembled as plain data
 * (kept separate from `ReportRendererService`'s PDF/Excel rendering) so
 * the numbers going into a report are unit-testable without invoking
 * Puppeteer/ExcelJS at all. Reuses `ProfitabilityQueryService`/
 * `DoctorAnalyticsService`'s existing read methods directly — never
 * re-queries or reimplements the underlying formulas, per
 * docs/18_FORMULA_REFERENCE.md §2's single-implementation rule.
 */
@Injectable()
export class ReportDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly profitabilityQueryService: ProfitabilityQueryService,
    private readonly doctorAnalyticsService: DoctorAnalyticsService
  ) {}

  async buildExecutiveSummary(hospitalId: string, periodId: string, allocationRunId?: string): Promise<ExecutiveSummaryData> {
    const [hospital, run] = await Promise.all([
      this.prisma.hospital.findFirstOrThrow({ where: { id: hospitalId } }),
      this.resolveRun(hospitalId, periodId, allocationRunId),
    ]);
    const period = await this.prisma.period.findFirstOrThrow({ where: { id: run.periodId } });

    const [summary, profitCenters, trend] = await Promise.all([
      this.profitabilityQueryService.summary(hospitalId, { periodId, allocationRunId }),
      this.profitabilityQueryService.profitCenters(hospitalId, { periodId, allocationRunId }),
      this.hospitalWideTrend(hospitalId),
    ]);

    const sortedByMargin = profitCenters.data;
    return {
      hospitalName: hospital.name,
      periodLabel: period.label,
      allocationRunId: run.id,
      generatedAt: new Date(),
      totalRevenue: summary.totalRevenue,
      totalCost: summary.totalCost,
      totalGrossProfit: summary.totalGrossProfit,
      overallMargin: summary.overallMargin,
      trend,
      topProfitCenters: sortedByMargin.slice(0, 5),
      bottomProfitCenters: [...sortedByMargin].reverse().slice(0, 5),
    };
  }

  async buildProfitabilityDetail(hospitalId: string, periodId: string, allocationRunId?: string): Promise<ProfitabilityDetailData> {
    const [hospital, run] = await Promise.all([
      this.prisma.hospital.findFirstOrThrow({ where: { id: hospitalId } }),
      this.resolveRun(hospitalId, periodId, allocationRunId),
    ]);
    const period = await this.prisma.period.findFirstOrThrow({ where: { id: run.periodId } });

    const [profitCenters, services] = await Promise.all([
      this.profitabilityQueryService.profitCenters(hospitalId, { periodId, allocationRunId }),
      this.profitabilityQueryService.services(hospitalId, { periodId, allocationRunId }),
    ]);

    const servicesByProfitCenterId = new Map<string, ServiceUnitCostRowDto[]>();
    for (const service of services.data) {
      const list = servicesByProfitCenterId.get(service.profitCenterId) ?? [];
      list.push(service);
      servicesByProfitCenterId.set(service.profitCenterId, list);
    }

    return {
      hospitalName: hospital.name,
      periodLabel: period.label,
      allocationRunId: run.id,
      generatedAt: new Date(),
      profitCenters: profitCenters.data,
      servicesByProfitCenterId,
      allServices: services.data,
    };
  }

  async buildDoctorAnalytics(
    hospitalId: string,
    periodId: string,
    allocationRunId: string | undefined,
    callerRoleName: string | null
  ): Promise<DoctorAnalyticsData> {
    const [hospital, run] = await Promise.all([
      this.prisma.hospital.findFirstOrThrow({ where: { id: hospitalId } }),
      this.resolveRun(hospitalId, periodId, allocationRunId),
    ]);
    const period = await this.prisma.period.findFirstOrThrow({ where: { id: run.periodId } });

    const summary = await this.doctorAnalyticsService.summary(hospitalId, { periodId, allocationRunId });
    const grantedCodes = await this.permissionsService.getPermissionCodesForRoleName(hospitalId, callerRoleName);
    const hasDetailAccess = grantedCodes.includes(READ_DETAIL_PERMISSION);

    const identifiedByServiceId = new Map<string, DoctorComparisonIdentifiedResponseDto[]>();
    if (hasDetailAccess) {
      const doctorServicePairs = await this.prisma.doctorProfitabilityResult.findMany({
        where: { allocationRunId: run.id },
        select: { serviceId: true, doctorId: true },
        distinct: ["serviceId", "doctorId"],
      });
      for (const pair of doctorServicePairs) {
        const result = await this.doctorAnalyticsService.comparison(
          hospitalId,
          pair.serviceId,
          { periodId, allocationRunId, doctorId: pair.doctorId },
          callerRoleName
        );
        if ("doctorId" in result) {
          const list = identifiedByServiceId.get(pair.serviceId) ?? [];
          list.push(result);
          identifiedByServiceId.set(pair.serviceId, list);
        }
      }
    }

    return {
      hospitalName: hospital.name,
      periodLabel: period.label,
      allocationRunId: run.id,
      generatedAt: new Date(),
      hasDetailAccess,
      summaryRows: summary.data,
      identifiedByServiceId,
    };
  }

  /** Hospital-wide (all profit centers combined) revenue/cost/margin across every period with a completed, non-stale run — same "gap, never interpolated" convention as `ProfitabilityQueryService.trends()`, just summed across the whole hospital instead of scoped to one profit center. */
  private async hospitalWideTrend(hospitalId: string): Promise<TrendPoint[]> {
    const periods = await this.prisma.period.findMany({ where: { hospitalId }, orderBy: { startDate: "asc" } });

    const points = await Promise.all(
      periods.map(async (period): Promise<TrendPoint | null> => {
        const run = await this.prisma.allocationRun.findFirst({
          where: { hospitalId, periodId: period.id, status: "completed", isStale: false },
          orderBy: { createdAt: "desc" },
        });
        if (!run) return null;

        const summary = await this.profitabilityQueryService.summary(hospitalId, { periodId: period.id });
        return { periodLabel: period.label, revenue: summary.totalRevenue, cost: summary.totalCost, margin: summary.overallMargin };
      })
    );

    return points.filter((p): p is TrendPoint => p !== null);
  }

  /** Same "latest completed, non-stale run unless explicit" contract as every other read service this session. */
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
