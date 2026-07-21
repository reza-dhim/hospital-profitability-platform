import { NotFoundException } from "@nestjs/common";
import { DoctorAnalyticsService } from "./doctor-analytics.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { PermissionsService } from "../auth/permissions.service";

const completedRun = { id: "run-1", hospitalId: "hospital-1", periodId: "period-1", status: "completed", isStale: false };

const doctorResults = [
  {
    doctorId: "doc-1",
    serviceId: "svc-1",
    revenue: "3000000.00",
    cost: "2800000.00",
    profit: "200000.00",
    margin: "6.6667",
    avgDuration: "30.00",
    avgBmhp: "500000.00",
    doctor: { code: "DOC-1", name: "Dr. Satu" },
    service: { code: "SVC-1", name: "Konsultasi" },
  },
  {
    doctorId: "doc-2",
    serviceId: "svc-1",
    revenue: "2000000.00",
    cost: "1900000.00",
    profit: "100000.00",
    margin: "5.0000",
    avgDuration: "45.00",
    avgBmhp: "400000.00",
    doctor: { code: "DOC-2", name: "Dr. Dua" },
    service: { code: "SVC-1", name: "Konsultasi" },
  },
];

const activityGroups = [
  {
    doctorId: "doc-1",
    serviceId: "svc-1",
    _sum: { volume: 12 },
    _count: { _all: 12 },
    _avg: { bmhpCost: 500000, durationMinutes: 30, roomCost: 300000, staffCost: 200000 },
  },
  {
    doctorId: "doc-2",
    serviceId: "svc-1",
    _sum: { volume: 8 },
    _count: { _all: 2 }, // below the 5-case minimum
    _avg: { bmhpCost: 400000, durationMinutes: 45, roomCost: 200000, staffCost: 100000 },
  },
];

function makeDeps() {
  const prisma = {
    allocationRun: { findFirst: jest.fn().mockResolvedValue(completedRun) },
    service: { findFirst: jest.fn().mockResolvedValue({ id: "svc-1", code: "SVC-1", name: "Konsultasi" }) },
    doctorProfitabilityResult: { findMany: jest.fn().mockResolvedValue(doctorResults) },
    medicalActivity: { groupBy: jest.fn().mockResolvedValue(activityGroups) },
  } as unknown as PrismaService;

  const permissionsService = {
    getPermissionCodesForRoleName: jest.fn().mockResolvedValue([]),
  } as unknown as PermissionsService;

  return { prisma, permissionsService };
}

describe("DoctorAnalyticsService.summary", () => {
  it("resolves to the latest completed, non-stale run when no allocationRunId is given", async () => {
    const { prisma, permissionsService } = makeDeps();
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    await service.summary("hospital-1", { periodId: "period-1" });

    expect(prisma.allocationRun.findFirst).toHaveBeenCalledWith({
      where: { hospitalId: "hospital-1", periodId: "period-1", status: "completed", isStale: false },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns an empty data array when the run has no doctor_profitability_results", async () => {
    const { prisma, permissionsService } = makeDeps();
    (prisma.doctorProfitabilityResult.findMany as jest.Mock).mockResolvedValue([]);
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    const result = await service.summary("hospital-1", { periodId: "period-1" });

    expect(result).toEqual({ allocationRunId: "run-1", periodId: "period-1", data: [] });
  });

  /**
   * MANUAL CALCULATION: SVC-1 has 2 doctors.
   *   totalRevenue = 3,000,000+2,000,000 = 5,000,000
   *   totalCost    = 2,800,000+1,900,000 = 4,700,000
   *   totalProfit  = 200,000+100,000     = 300,000
   *   overallMargin = 300,000/5,000,000*100 = 6.0000%
   * unit-cost-equivalent = cost/volume: DOC-1 = 2,800,000/12 = 233,333.33; DOC-2 = 1,900,000/8 = 237,500.
   * DOC-2 has only 2 cases (< 5 minimum) -> insufficientSampleDoctorCount = 1.
   */
  it("aggregates per-service totals and cohort stats, never mentioning a doctor by id or name anywhere in the payload", async () => {
    const { prisma, permissionsService } = makeDeps();
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    const result = await service.summary("hospital-1", { periodId: "period-1" });

    expect(result.data).toHaveLength(1);
    const row = result.data[0]!;
    expect(row.serviceId).toBe("svc-1");
    expect(row.doctorCount).toBe(2);
    expect(row.totalRevenue).toBe("5000000.00");
    expect(row.totalCost).toBe("4700000.00");
    expect(row.totalProfit).toBe("300000.00");
    expect(row.overallMargin).toBe("6.0000");
    expect(row.insufficientSampleDoctorCount).toBe(1);
    expect(row.cohort!.doctorCount).toBe(2);

    // Fairness rule (docs/01_BUSINESS_RULES.md §7 / 04_RBAC.md §5): summary is
    // service-grain and must NEVER surface a doctor identifier, in any field.
    const raw = JSON.stringify(result);
    expect(raw).not.toContain("doc-1");
    expect(raw).not.toContain("doc-2");
    expect(raw).not.toContain("DOC-1");
    expect(raw).not.toContain("Dr. Satu");
  });
});

describe("DoctorAnalyticsService.comparison", () => {
  it("throws when the service doesn't exist for this hospital", async () => {
    const { prisma, permissionsService } = makeDeps();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    await expect(service.comparison("hospital-1", "svc-1", { periodId: "period-1" }, "tim_costing")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("returns the de-identified band shape when the caller lacks doctor_analytics.read_detail", async () => {
    const { prisma, permissionsService } = makeDeps();
    (permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue(["doctor_analytics.read"]);
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    const result = await service.comparison("hospital-1", "svc-1", { periodId: "period-1", doctorId: "doc-1" }, "tim_costing");

    expect("doctorId" in result).toBe(false);
    expect("bands" in result).toBe(true);
    const raw = JSON.stringify(result);
    expect(raw).not.toContain("doc-1");
    expect(raw).not.toContain("DOC-1");
    expect(raw).not.toContain("Dr. Satu");
  });

  it("returns the de-identified shape when the caller HAS read_detail but omits doctorId", async () => {
    const { prisma, permissionsService } = makeDeps();
    (permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue([
      "doctor_analytics.read",
      "doctor_analytics.read_detail",
    ]);
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    const result = await service.comparison("hospital-1", "svc-1", { periodId: "period-1" }, "direktur");

    expect("doctorId" in result).toBe(false);
    expect("bands" in result).toBe(true);
  });

  /**
   * MANUAL CALCULATION: DOC-1 unit-cost-equivalent = 2,800,000/12 = 233,333.3333.
   * Cohort median (2 values: 233,333.33 and 237,500) = average of the two
   * middle values (N=2) = (233,333.3333+237,500)/2 = 235,416.6667.
   * totalCostDelta = (233,333.3333 - 235,416.6667) * 12 = -2,083.3334 * 12 = -25,000.0008 ≈ -25,000.
   */
  it("returns the identified shape with factors and totalCostDelta when the caller has read_detail and supplies doctorId", async () => {
    const { prisma, permissionsService } = makeDeps();
    (permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue([
      "doctor_analytics.read",
      "doctor_analytics.read_detail",
    ]);
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    const result = (await service.comparison(
      "hospital-1",
      "svc-1",
      { periodId: "period-1", doctorId: "doc-1" },
      "direktur"
    )) as import("./dto/doctor-comparison-response.dto").DoctorComparisonIdentifiedResponseDto;

    expect(result.doctorId).toBe("doc-1");
    expect(result.doctorName).toBe("Dr. Satu");
    expect(result.caseCount).toBe(12);
    expect(result.sufficientSample).toBe(true);
    expect(result.unitCostEquivalent).toBe("233333.3333");
    expect(result.percentileBand).not.toBeNull();
    expect(Number(result.totalCostDelta)).toBeCloseTo(-25000, 0);
    expect(result.factors).toHaveLength(4);
    expect(result.factors.map((f) => f.factor)).toEqual(["bmhp_cost", "duration_minutes", "room_cost", "staff_cost"]);
    expect(result.insufficientDataReason).toBeNull();
  });

  it("flags sufficientSample=false and nulls percentileBand, but still populates factors, for a doctor below the 5-case minimum", async () => {
    const { prisma, permissionsService } = makeDeps();
    (permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue([
      "doctor_analytics.read",
      "doctor_analytics.read_detail",
    ]);
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    const result = (await service.comparison(
      "hospital-1",
      "svc-1",
      { periodId: "period-1", doctorId: "doc-2" },
      "direktur"
    )) as import("./dto/doctor-comparison-response.dto").DoctorComparisonIdentifiedResponseDto;

    expect(result.caseCount).toBe(2);
    expect(result.sufficientSample).toBe(false);
    expect(result.percentileBand).toBeNull();
    expect(result.insufficientDataReason).not.toBeNull();
    // Fairness rule: a bare "insufficient data" with nothing else is never permitted — factors must still be present.
    expect(result.factors).toHaveLength(4);
    expect(result.factors.every((f) => f.doctorAvg !== null)).toBe(true);
  });

  it("throws when doctorId doesn't match any doctor with activity for this service", async () => {
    const { prisma, permissionsService } = makeDeps();
    (permissionsService.getPermissionCodesForRoleName as jest.Mock).mockResolvedValue([
      "doctor_analytics.read",
      "doctor_analytics.read_detail",
    ]);
    const service = new DoctorAnalyticsService(prisma, permissionsService);

    await expect(
      service.comparison("hospital-1", "svc-1", { periodId: "period-1", doctorId: "doc-999" }, "direktur")
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
