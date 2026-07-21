import { NotFoundException } from "@nestjs/common";
import { ReportDataService } from "./report-data.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { PermissionsService } from "../auth/permissions.service";
import type { ProfitabilityQueryService } from "../profitability/profitability-query.service";
import type { DoctorAnalyticsService } from "../doctor-analytics/doctor-analytics.service";

const completedRun = { id: "run-1", hospitalId: "h1", periodId: "period-1", status: "completed", isStale: false };
const hospital = { id: "h1", name: "Rumah Sakit Contoh" };
const period = { id: "period-1", label: "2026-06" };

function makeProfitCenterRow(code: string, margin: string) {
  return {
    profitCenterId: `pc-${code}`,
    profitCenterCode: code,
    profitCenterName: code,
    revenue: "1000000.00",
    directCost: "0.00",
    allocatedCost: "500000.00",
    totalCost: "500000.00",
    grossProfit: "500000.00",
    margin,
    totalCostVariance: null,
  };
}

function makeDeps() {
  const prisma = {
    hospital: { findFirstOrThrow: jest.fn().mockResolvedValue(hospital) },
    period: {
      findFirstOrThrow: jest.fn().mockResolvedValue(period),
      findMany: jest.fn().mockResolvedValue([period]),
    },
    allocationRun: { findFirst: jest.fn().mockResolvedValue(completedRun) },
    doctorProfitabilityResult: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const permissionsService = {
    getPermissionCodesForRoleName: jest.fn().mockResolvedValue([] as string[]),
  } as unknown as PermissionsService;

  const profitabilityQueryService = {
    summary: jest.fn().mockResolvedValue({
      totalRevenue: "5000000.00",
      totalCost: "3000000.00",
      totalGrossProfit: "2000000.00",
      overallMargin: "40.0000",
    }),
    profitCenters: jest.fn().mockResolvedValue({ data: [] }),
    services: jest.fn().mockResolvedValue({ data: [] }),
  } as unknown as ProfitabilityQueryService;

  const doctorAnalyticsService = {
    summary: jest.fn().mockResolvedValue({ allocationRunId: "run-1", periodId: "period-1", data: [] }),
    comparison: jest.fn(),
  } as unknown as DoctorAnalyticsService;

  return { prisma, permissionsService, profitabilityQueryService, doctorAnalyticsService };
}

describe("ReportDataService.buildExecutiveSummary", () => {
  it("takes the first 5 (top) and last 5 reversed (bottom) profit centers from the already-margin-sorted list", async () => {
    const deps = makeDeps();
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((c, i) => makeProfitCenterRow(c, String(90 - i * 10)));
    (deps.profitabilityQueryService.profitCenters as jest.Mock).mockResolvedValue({ data: rows });
    const service = new ReportDataService(deps.prisma, deps.permissionsService, deps.profitabilityQueryService, deps.doctorAnalyticsService);

    const data = await service.buildExecutiveSummary("h1", "period-1");

    expect(data.topProfitCenters.map((r) => r.profitCenterCode)).toEqual(["A", "B", "C", "D", "E"]);
    expect(data.bottomProfitCenters.map((r) => r.profitCenterCode)).toEqual(["G", "F", "E", "D", "C"]);
    expect(data.totalRevenue).toBe("5000000.00");
    expect(data.hospitalName).toBe("Rumah Sakit Contoh");
    expect(data.periodLabel).toBe("2026-06");
  });

  it("skips periods with no completed allocation run when building the hospital-wide trend, same 'gap, never interpolated' convention as ProfitabilityQueryService.trends()", async () => {
    const deps = makeDeps();
    const periodWithRun = { id: "p1", label: "2026-01" };
    const periodWithoutRun = { id: "p2", label: "2026-02" };
    (deps.prisma.period.findMany as jest.Mock).mockResolvedValue([periodWithRun, periodWithoutRun]);
    (deps.prisma.allocationRun.findFirst as jest.Mock).mockImplementation(({ where }) =>
      Promise.resolve(where.periodId === "p2" ? null : completedRun)
    );
    const service = new ReportDataService(deps.prisma, deps.permissionsService, deps.profitabilityQueryService, deps.doctorAnalyticsService);

    const data = await service.buildExecutiveSummary("h1", "period-1");

    expect(data.trend).toHaveLength(1);
    expect(data.trend[0]!.periodLabel).toBe("2026-01");
  });

  it("throws NotFoundException when no completed run exists for the requested period", async () => {
    const deps = makeDeps();
    (deps.prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ReportDataService(deps.prisma, deps.permissionsService, deps.profitabilityQueryService, deps.doctorAnalyticsService);

    await expect(service.buildExecutiveSummary("h1", "period-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ReportDataService.buildDoctorAnalytics", () => {
  it("never calls comparison() (identified data) when the caller's role lacks doctor_analytics.read_detail", async () => {
    const deps = makeDeps();
    (deps.permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue(["doctor_analytics.read"]);
    (deps.prisma.doctorProfitabilityResult.findMany as jest.Mock).mockResolvedValue([{ serviceId: "svc-1", doctorId: "doc-1" }]);
    const service = new ReportDataService(deps.prisma, deps.permissionsService, deps.profitabilityQueryService, deps.doctorAnalyticsService);

    const data = await service.buildDoctorAnalytics("h1", "period-1", undefined, "tim_costing");

    expect(data.hasDetailAccess).toBe(false);
    expect(data.identifiedByServiceId.size).toBe(0);
    expect(deps.doctorAnalyticsService.comparison).not.toHaveBeenCalled();
  });

  it("fetches per-doctor identified comparisons, grouped by service, when the caller holds doctor_analytics.read_detail", async () => {
    const deps = makeDeps();
    (deps.permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue([
      "doctor_analytics.read",
      "doctor_analytics.read_detail",
    ]);
    (deps.prisma.doctorProfitabilityResult.findMany as jest.Mock).mockResolvedValue([
      { serviceId: "svc-1", doctorId: "doc-1" },
      { serviceId: "svc-1", doctorId: "doc-2" },
    ]);
    (deps.doctorAnalyticsService.comparison as jest.Mock).mockImplementation((_h, _s, query) =>
      Promise.resolve({ doctorId: query.doctorId, serviceId: "svc-1", factors: [] })
    );
    const service = new ReportDataService(deps.prisma, deps.permissionsService, deps.profitabilityQueryService, deps.doctorAnalyticsService);

    const data = await service.buildDoctorAnalytics("h1", "period-1", undefined, "system_admin");

    expect(data.hasDetailAccess).toBe(true);
    expect(data.identifiedByServiceId.get("svc-1")).toHaveLength(2);
    expect(deps.doctorAnalyticsService.comparison).toHaveBeenCalledTimes(2);
  });

  it("does not add a de-identified (bandsOnly) comparison() response to identifiedByServiceId, even if one somehow came back", async () => {
    const deps = makeDeps();
    (deps.permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue(["doctor_analytics.read_detail"]);
    (deps.prisma.doctorProfitabilityResult.findMany as jest.Mock).mockResolvedValue([{ serviceId: "svc-1", doctorId: "doc-1" }]);
    (deps.doctorAnalyticsService.comparison as jest.Mock).mockResolvedValue({ serviceId: "svc-1", bands: [] });
    const service = new ReportDataService(deps.prisma, deps.permissionsService, deps.profitabilityQueryService, deps.doctorAnalyticsService);

    const data = await service.buildDoctorAnalytics("h1", "period-1", undefined, "system_admin");

    expect(data.identifiedByServiceId.size).toBe(0);
  });
});
