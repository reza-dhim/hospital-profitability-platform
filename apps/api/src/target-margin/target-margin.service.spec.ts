import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TargetMarginService } from "./target-margin.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditContextService } from "../audit/audit-context.service";

function makeDeps() {
  const prisma = {
    period: { findFirst: jest.fn() },
    profitCenter: { findFirst: jest.fn() },
    service: { findFirst: jest.fn() },
    targetMargin: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    hospitalSettings: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  return { prisma, auditContextService };
}

describe("TargetMarginService.create", () => {
  it("creates a hospital-scope row with scopeId null", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1" });
    (prisma.targetMargin.create as jest.Mock).mockResolvedValue({
      id: "tm-1",
      scopeType: "hospital",
      scopeId: null,
      targetMargin: { toString: () => "12" },
      effectivePeriodId: "period-1",
    });
    const service = new TargetMarginService(prisma, auditContextService);

    await service.create("hospital-1", { scopeType: "hospital", targetMargin: 12, effectivePeriodId: "period-1" }, "actor-1");

    expect(prisma.targetMargin.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        scopeType: "hospital",
        scopeId: null,
        targetMargin: 12,
        effectivePeriodId: "period-1",
        setByUserId: "actor-1",
      },
    });
  });

  it("rejects a hospital-scope row that also sets scopeId", async () => {
    const { prisma, auditContextService } = makeDeps();
    const service = new TargetMarginService(prisma, auditContextService);

    await expect(
      service.create(
        "hospital-1",
        { scopeType: "hospital", scopeId: "pc-1", targetMargin: 12, effectivePeriodId: "period-1" },
        "actor-1"
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.targetMargin.create).not.toHaveBeenCalled();
  });

  it("rejects a profit_center-scope row missing scopeId", async () => {
    const { prisma, auditContextService } = makeDeps();
    const service = new TargetMarginService(prisma, auditContextService);

    await expect(
      service.create("hospital-1", { scopeType: "profit_center", targetMargin: 12, effectivePeriodId: "period-1" }, "actor-1")
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFoundException when effectivePeriodId doesn't belong to this hospital", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new TargetMarginService(prisma, auditContextService);

    await expect(
      service.create("hospital-1", { scopeType: "hospital", targetMargin: 12, effectivePeriodId: "missing" }, "actor-1")
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when the profit_center scopeId doesn't exist for this hospital", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1" });
    (prisma.profitCenter.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new TargetMarginService(prisma, auditContextService);

    await expect(
      service.create(
        "hospital-1",
        { scopeType: "profit_center", scopeId: "missing-pc", targetMargin: 12, effectivePeriodId: "period-1" },
        "actor-1"
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.targetMargin.create).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the service scopeId doesn't exist for this hospital", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1" });
    (prisma.service.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new TargetMarginService(prisma, auditContextService);

    await expect(
      service.create(
        "hospital-1",
        { scopeType: "service", scopeId: "missing-svc", targetMargin: 12, effectivePeriodId: "period-1" },
        "actor-1"
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("TargetMarginService.resolveForService", () => {
  /**
   * MANUAL CALCULATION: service target margin set to 20 in period 2026-01
   * (startDate 2026-01-01), no newer row. Resolving for period 2026-03
   * (startDate 2026-03-01) must still return 20 — carry-forward, not an
   * exact-period match (Sprint 6 sub-task 0 design decision).
   */
  it("carries a service-scope row forward to a later period with no newer row", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-03", startDate: new Date("2026-03-01") });
    (prisma.targetMargin.findFirst as jest.Mock).mockImplementation((args: { where: { scopeType: string } }) => {
      if (args.where.scopeType === "service") return Promise.resolve({ targetMargin: 20 });
      return Promise.resolve(null);
    });
    (prisma.hospitalSettings.findUnique as jest.Mock).mockResolvedValue({ defaultTargetMargin: 15 });
    const service = new TargetMarginService(prisma, auditContextService);

    const resolved = await service.resolveForService("hospital-1", "period-03", "service-1", "pc-1");

    expect(resolved.toNumber()).toBe(20);
  });

  it("falls back service -> profit_center -> hospital-scope -> hospital_settings default in that order", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1", startDate: new Date("2026-01-01") });
    (prisma.targetMargin.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.hospitalSettings.findUnique as jest.Mock).mockResolvedValue({ defaultTargetMargin: 15 });
    const service = new TargetMarginService(prisma, auditContextService);

    const resolved = await service.resolveForService("hospital-1", "period-1", "service-1", "pc-1");

    expect(resolved.toNumber()).toBe(15);
  });

  it("falls back to the hardcoded 15 default when hospital_settings itself doesn't exist yet", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1", startDate: new Date("2026-01-01") });
    (prisma.targetMargin.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.hospitalSettings.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new TargetMarginService(prisma, auditContextService);

    const resolved = await service.resolveForService("hospital-1", "period-1", "service-1", "pc-1");

    expect(resolved.toNumber()).toBe(15);
  });

  it("prefers the service-scope row over profit_center and hospital-scope rows when all three exist", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1", startDate: new Date("2026-01-01") });
    (prisma.targetMargin.findFirst as jest.Mock).mockImplementation((args: { where: { scopeType: string } }) => {
      if (args.where.scopeType === "service") return Promise.resolve({ targetMargin: 25 });
      if (args.where.scopeType === "profit_center") return Promise.resolve({ targetMargin: 18 });
      return Promise.resolve({ targetMargin: 10 });
    });
    const service = new TargetMarginService(prisma, auditContextService);

    const resolved = await service.resolveForService("hospital-1", "period-1", "service-1", "pc-1");

    expect(resolved.toNumber()).toBe(25);
  });

  it("prefers the profit_center-scope row over hospital-scope when no service-scope row exists", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1", startDate: new Date("2026-01-01") });
    (prisma.targetMargin.findFirst as jest.Mock).mockImplementation((args: { where: { scopeType: string } }) => {
      if (args.where.scopeType === "profit_center") return Promise.resolve({ targetMargin: 18 });
      if (args.where.scopeType === "hospital") return Promise.resolve({ targetMargin: 10 });
      return Promise.resolve(null);
    });
    const service = new TargetMarginService(prisma, auditContextService);

    const resolved = await service.resolveForService("hospital-1", "period-1", "service-1", "pc-1");

    expect(resolved.toNumber()).toBe(18);
  });

  it("throws NotFoundException when the period doesn't belong to this hospital", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new TargetMarginService(prisma, auditContextService);

    await expect(service.resolveForService("hospital-1", "missing", "service-1", "pc-1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
