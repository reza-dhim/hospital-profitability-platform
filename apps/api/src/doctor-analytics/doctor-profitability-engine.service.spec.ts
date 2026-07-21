import { DoctorProfitabilityEngineService } from "./doctor-profitability-engine.service";
import type { PrismaService } from "../prisma/prisma.service";

function makeDeps(groupByResult: unknown[]) {
  const prisma = {
    medicalActivity: { groupBy: jest.fn().mockResolvedValue(groupByResult) },
  } as unknown as PrismaService;
  return { prisma };
}

describe("DoctorProfitabilityEngineService.computeRows", () => {
  it("returns an empty array when there is no medical_activities data for the period", async () => {
    const { prisma } = makeDeps([]);
    const service = new DoctorProfitabilityEngineService(prisma);

    const rows = await service.computeRows("hospital-1", "run-1", "period-1", new Map());

    expect(rows).toEqual([]);
  });

  /**
   * MANUAL CALCULATION: service SVC-A has serviceAllocatedCost 8,000,000
   * (already computed by the unit-cost stage, passed in). Two doctors
   * performed SVC-A this period: DOC-1 volume 6, DOC-2 volume 4 -> total
   * service volume 10.
   *   DOC-1 volumeShare = 6/10 = 0.6 -> apportioned = 8,000,000*0.6 = 4,800,000
   *   DOC-2 volumeShare = 4/10 = 0.4 -> apportioned = 8,000,000*0.4 = 3,200,000
   * DOC-1 ownCost = 100,000+200,000+50,000 = 350,000 -> cost = 4,800,000+350,000 = 5,150,000
   *   revenue 6,000,000 -> profit = 6,000,000-5,150,000 = 850,000 -> margin = 850,000/6,000,000*100 = 14.1666...% ≈ 14.1667%
   * DOC-2 ownCost = 80,000+150,000+40,000 = 270,000 -> cost = 3,200,000+270,000 = 3,470,000
   *   revenue 4,000,000 -> profit = 4,000,000-3,470,000 = 530,000 -> margin = 530,000/4,000,000*100 = 13.25%
   */
  it("apportions serviceAllocatedCost by each doctor's volume share and matches the hand-computed unit economics exactly", async () => {
    const { prisma } = makeDeps([
      {
        doctorId: "DOC-1",
        serviceId: "SVC-A",
        _sum: { revenue: 6_000_000, bmhpCost: 100_000, roomCost: 200_000, staffCost: 50_000, volume: 6 },
        _avg: { durationMinutes: 30, bmhpCost: 100_000 },
      },
      {
        doctorId: "DOC-2",
        serviceId: "SVC-A",
        _sum: { revenue: 4_000_000, bmhpCost: 80_000, roomCost: 150_000, staffCost: 40_000, volume: 4 },
        _avg: { durationMinutes: 40, bmhpCost: 80_000 },
      },
    ]);
    const service = new DoctorProfitabilityEngineService(prisma);

    const rows = await service.computeRows("hospital-1", "run-1", "period-1", new Map([["SVC-A", 8_000_000 as never]]));
    const byDoctorId = Object.fromEntries(rows.map((r) => [r.doctorId, r]));

    expect(byDoctorId["DOC-1"]).toEqual({
      allocationRunId: "run-1",
      doctorId: "DOC-1",
      serviceId: "SVC-A",
      revenue: "6000000.00",
      cost: "5150000.00",
      profit: "850000.00",
      margin: "14.1667",
      avgDuration: "30.00",
      avgBmhp: "100000.00",
    });
    expect(byDoctorId["DOC-2"]).toEqual({
      allocationRunId: "run-1",
      doctorId: "DOC-2",
      serviceId: "SVC-A",
      revenue: "4000000.00",
      cost: "3470000.00",
      profit: "530000.00",
      margin: "13.2500",
      avgDuration: "40.00",
      avgBmhp: "80000.00",
    });
  });

  it("falls back to an equal split across doctors when the service's total volume is zero", async () => {
    const { prisma } = makeDeps([
      {
        doctorId: "DOC-1",
        serviceId: "SVC-A",
        _sum: { revenue: 0, bmhpCost: 0, roomCost: 0, staffCost: 0, volume: 0 },
        _avg: { durationMinutes: 0, bmhpCost: 0 },
      },
      {
        doctorId: "DOC-2",
        serviceId: "SVC-A",
        _sum: { revenue: 0, bmhpCost: 0, roomCost: 0, staffCost: 0, volume: 0 },
        _avg: { durationMinutes: 0, bmhpCost: 0 },
      },
    ]);
    const service = new DoctorProfitabilityEngineService(prisma);

    const rows = await service.computeRows("hospital-1", "run-1", "period-1", new Map([["SVC-A", 10_000_000 as never]]));

    // Equal split: 10,000,000 / 2 doctors = 5,000,000 each.
    expect(rows.map((r) => r.cost).sort()).toEqual(["5000000.00", "5000000.00"]);
  });

  it("writes margin = null when revenue is zero", async () => {
    const { prisma } = makeDeps([
      {
        doctorId: "DOC-1",
        serviceId: "SVC-A",
        _sum: { revenue: 0, bmhpCost: 10_000, roomCost: 0, staffCost: 0, volume: 1 },
        _avg: { durationMinutes: 10, bmhpCost: 10_000 },
      },
    ]);
    const service = new DoctorProfitabilityEngineService(prisma);

    const rows = await service.computeRows("hospital-1", "run-1", "period-1", new Map([["SVC-A", 1_000 as never]]));

    expect(rows[0]!.margin).toBeNull();
  });

  it("treats a service with no entry in serviceAllocatedCostByServiceId as zero allocated cost (own cost only)", async () => {
    const { prisma } = makeDeps([
      {
        doctorId: "DOC-1",
        serviceId: "SVC-UNKNOWN",
        _sum: { revenue: 500_000, bmhpCost: 100_000, roomCost: 50_000, staffCost: 25_000, volume: 2 },
        _avg: { durationMinutes: 20, bmhpCost: 100_000 },
      },
    ]);
    const service = new DoctorProfitabilityEngineService(prisma);

    const rows = await service.computeRows("hospital-1", "run-1", "period-1", new Map());

    expect(rows[0]!.cost).toBe("175000.00"); // 100,000 + 50,000 + 25,000, no allocated cost apportioned
  });
});
