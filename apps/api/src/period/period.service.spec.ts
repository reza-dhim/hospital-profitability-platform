import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PeriodService } from "./period.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditContextService } from "../audit/audit-context.service";

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

function makeDeps() {
  const prisma = {
    hospitalSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    period: {
      createManyAndReturn: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  return { prisma, auditContextService };
}

describe("PeriodService.generate", () => {
  it("generates 12 consecutive monthly draft periods starting in January by default", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.createManyAndReturn as jest.Mock).mockResolvedValue([{ id: "p-1" }]);

    const service = new PeriodService(prisma, auditContextService);
    await service.generate("hospital-1", { fiscalYear: 2026 }, "actor-1");

    const call = (prisma.period.createManyAndReturn as jest.Mock).mock.calls[0][0];
    expect(call.data).toHaveLength(12);
    expect(call.data[0]).toMatchObject({
      hospitalId: "hospital-1",
      label: "2026-01",
      startDate: new Date(Date.UTC(2026, 0, 1)),
      endDate: new Date(Date.UTC(2026, 1, 1)),
      status: "draft",
      createdByUserId: "actor-1",
      updatedByUserId: "actor-1",
    });
    expect(call.data[11]).toMatchObject({ label: "2026-12" });

    expect(auditContextService.record).toHaveBeenCalledWith({
      entity: "period",
      action: "period.generate",
      entityId: null,
      before: null,
      after: { labels: call.data.map((d: { label: string }) => d.label) },
    });
  });

  it("rolls the label year forward for a non-January fiscal-year start", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.hospitalSettings.findUnique as jest.Mock).mockResolvedValue({ fiscalYearStartMonth: 4 });
    (prisma.period.createManyAndReturn as jest.Mock).mockResolvedValue([]);

    const service = new PeriodService(prisma, auditContextService);
    await service.generate("hospital-1", { fiscalYear: 2026 }, "actor-1");

    const call = (prisma.period.createManyAndReturn as jest.Mock).mock.calls[0][0];
    expect(call.data[0]).toMatchObject({ label: "2026-04" });
    expect(call.data[8]).toMatchObject({ label: "2026-12" });
    expect(call.data[9]).toMatchObject({ label: "2027-01" });
    expect(call.data[11]).toMatchObject({ label: "2027-03" });
  });

  it("throws a Conflict when one or more periods already exist for this hospital/fiscal year", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.createManyAndReturn as jest.Mock).mockRejectedValue(uniqueConstraintError());

    const service = new PeriodService(prisma, auditContextService);
    const error = await service.generate("hospital-1", { fiscalYear: 2026 }, "actor-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: "PERIOD_ALREADY_EXISTS" });
    expect(auditContextService.record).not.toHaveBeenCalled();
  });
});

describe("PeriodService transitions", () => {
  const draftPeriod = { id: "period-1", hospitalId: "hospital-1", status: "draft", deletedAt: null };
  const openPeriod = { ...draftPeriod, status: "open" };
  const lockedPeriod = { ...draftPeriod, status: "locked" };
  const closedPeriod = { ...draftPeriod, status: "closed" };

  it("open() transitions draft -> open and records an audit entry", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(draftPeriod);
    (prisma.period.update as jest.Mock).mockResolvedValue(openPeriod);

    const service = new PeriodService(prisma, auditContextService);
    const result = await service.open("hospital-1", "period-1", "actor-1");

    expect(prisma.period.update).toHaveBeenCalledWith({
      where: { id: "period-1" },
      data: { status: "open", updatedByUserId: "actor-1" },
    });
    expect(result).toBe(openPeriod);
    expect(auditContextService.record).toHaveBeenCalledWith({
      entity: "period",
      action: "period.open",
      entityId: "period-1",
      before: { status: "draft" },
      after: { status: "open" },
    });
  });

  it("open() rejects a period that is not draft", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(openPeriod);

    const service = new PeriodService(prisma, auditContextService);
    const error = await service.open("hospital-1", "period-1", "actor-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: "PERIOD_INVALID_TRANSITION" });
    expect(prisma.period.update).not.toHaveBeenCalled();
  });

  it("lock() transitions open -> locked and stamps lockedAt", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(openPeriod);
    (prisma.period.update as jest.Mock).mockResolvedValue(lockedPeriod);

    const service = new PeriodService(prisma, auditContextService);
    await service.lock("hospital-1", "period-1", "actor-1");

    expect(prisma.period.update).toHaveBeenCalledWith({
      where: { id: "period-1" },
      data: { status: "locked", updatedByUserId: "actor-1", lockedAt: expect.any(Date) },
    });
    expect(auditContextService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "period.lock", before: { status: "open" }, after: { status: "locked" } })
    );
  });

  it("lock() rejects a period that is not open", async () => {
    const { prisma } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(draftPeriod);
    const service = new PeriodService(prisma, { record: jest.fn() } as unknown as AuditContextService);
    await expect(service.lock("hospital-1", "period-1", "actor-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("close() transitions locked -> closed and stamps closedAt", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(lockedPeriod);
    (prisma.period.update as jest.Mock).mockResolvedValue(closedPeriod);

    const service = new PeriodService(prisma, auditContextService);
    await service.close("hospital-1", "period-1", "actor-1");

    expect(prisma.period.update).toHaveBeenCalledWith({
      where: { id: "period-1" },
      data: { status: "closed", updatedByUserId: "actor-1", closedAt: expect.any(Date) },
    });
  });

  it("close() rejects a period that is not locked", async () => {
    const { prisma } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(openPeriod);
    const service = new PeriodService(prisma, { record: jest.fn() } as unknown as AuditContextService);
    await expect(service.close("hospital-1", "period-1", "actor-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ["locked", lockedPeriod],
    ["closed", closedPeriod],
  ])("reopen() transitions %s -> open, stamps reopenedAt, and records the reason on the audit entry", async (_label, period) => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(period);
    (prisma.period.update as jest.Mock).mockResolvedValue(openPeriod);

    const service = new PeriodService(prisma, auditContextService);
    const result = await service.reopen("hospital-1", "period-1", { reason: "Board correction" }, "actor-1");

    expect(prisma.period.update).toHaveBeenCalledWith({
      where: { id: "period-1" },
      data: { status: "open", reopenedAt: expect.any(Date), updatedByUserId: "actor-1" },
    });
    expect(result).toBe(openPeriod);
    expect(auditContextService.record).toHaveBeenCalledWith({
      entity: "period",
      action: "period.reopen",
      entityId: "period-1",
      before: { status: period.status },
      after: { status: "open", reason: "Board correction" },
    });
  });

  it.each([["draft", draftPeriod], ["open", openPeriod]])(
    "reopen() rejects a period that is %s",
    async (_label, period) => {
      const { prisma } = makeDeps();
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(period);
      const service = new PeriodService(prisma, { record: jest.fn() } as unknown as AuditContextService);
      await expect(
        service.reopen("hospital-1", "period-1", { reason: "x" }, "actor-1")
      ).rejects.toBeInstanceOf(ConflictException);
    }
  );

  it("throws NotFoundException for a period outside the caller's hospital or that doesn't exist", async () => {
    const { prisma } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new PeriodService(prisma, { record: jest.fn() } as unknown as AuditContextService);
    await expect(service.open("hospital-1", "missing", "actor-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("PeriodService.findAll / findOne", () => {
  it("findAll scopes by hospital, excludes soft-deleted rows, and applies the optional status filter", async () => {
    const { prisma } = makeDeps();
    (prisma.period.findMany as jest.Mock).mockResolvedValue([{ id: "p-1" }]);
    (prisma.period.count as jest.Mock).mockResolvedValue(1);

    const service = new PeriodService(prisma, { record: jest.fn() } as unknown as AuditContextService);
    const result = await service.findAll("hospital-1", { page: 1, limit: 20, status: "open" });

    expect(prisma.period.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hospitalId: "hospital-1", deletedAt: null, status: "open" } })
    );
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it("findOne throws NotFoundException when the period doesn't exist in this hospital", async () => {
    const { prisma } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new PeriodService(prisma, { record: jest.fn() } as unknown as AuditContextService);
    await expect(service.findOne("hospital-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
