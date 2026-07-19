import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AllocationRunService } from "./allocation-run.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditContextService } from "../audit/audit-context.service";
import type { AllocationQueueService } from "../queue/allocation-queue.service";

function makeDeps() {
  const prisma = {
    period: { findFirst: jest.fn() },
    allocationRun: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    allocatedCost: { findMany: jest.fn(), count: jest.fn() },
  } as unknown as PrismaService;
  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  const allocationQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as AllocationQueueService;
  return { prisma, auditContextService, allocationQueueService };
}

describe("AllocationRunService.create", () => {
  it("creates a draft allocation run when the period exists for this hospital, then enqueues an allocation.run job", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: "period-1" });
    (prisma.allocationRun.create as jest.Mock).mockResolvedValue({
      id: "run-1",
      hospitalId: "hospital-1",
      periodId: "period-1",
      method: "step_down",
      status: "draft",
    });
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    const run = await service.create("hospital-1", "org-1", { periodId: "period-1", method: "step_down" }, "actor-1");

    expect(prisma.period.findFirst).toHaveBeenCalledWith({
      where: { id: "period-1", hospitalId: "hospital-1", deletedAt: null },
    });
    expect(prisma.allocationRun.create).toHaveBeenCalledWith({
      data: { hospitalId: "hospital-1", periodId: "period-1", method: "step_down", status: "draft", createdByUserId: "actor-1" },
    });
    expect(run.status).toBe("draft");
    expect(auditContextService.record).toHaveBeenCalledWith({
      entity: "allocation_run",
      action: "allocation_run.create",
      entityId: "run-1",
      before: null,
      after: { periodId: "period-1", method: "step_down", status: "draft" },
    });
    expect(allocationQueueService.enqueue).toHaveBeenCalledWith("allocation.run", {
      allocationRunId: "run-1",
      hospitalId: "hospital-1",
      organizationId: "org-1",
      actorUserId: "actor-1",
    });
  });

  it("throws NotFoundException when the period doesn't exist for this hospital, and never enqueues", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    await expect(
      service.create("hospital-1", "org-1", { periodId: "missing", method: "direct" }, "actor-1")
    ).rejects.toThrow(NotFoundException);
    expect(prisma.allocationRun.create).not.toHaveBeenCalled();
    expect(allocationQueueService.enqueue).not.toHaveBeenCalled();
  });
});

describe("AllocationRunService.findAll", () => {
  it("filters by hospital, status, and periodId, and paginates", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findMany as jest.Mock).mockResolvedValue([{ id: "run-1" }]);
    (prisma.allocationRun.count as jest.Mock).mockResolvedValue(1);
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    const result = await service.findAll("hospital-1", { page: 2, limit: 10, status: "completed", periodId: "period-1" });

    const where = { hospitalId: "hospital-1", status: "completed", periodId: "period-1" };
    expect(prisma.allocationRun.findMany).toHaveBeenCalledWith({
      where,
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 10,
    });
    expect(prisma.allocationRun.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({ data: [{ id: "run-1" }], meta: { page: 2, limit: 10, total: 1 } });
  });
});

describe("AllocationRunService.findOne", () => {
  it("returns the run when found for this hospital", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({ id: "run-1" });
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    const run = await service.findOne("hospital-1", "run-1");

    expect(prisma.allocationRun.findFirst).toHaveBeenCalledWith({ where: { id: "run-1", hospitalId: "hospital-1" } });
    expect(run).toEqual({ id: "run-1" });
  });

  it("throws NotFoundException when the run doesn't exist for this hospital", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    await expect(service.findOne("hospital-1", "missing")).rejects.toThrow(NotFoundException);
  });
});

describe("AllocationRunService.findAllocatedCosts", () => {
  it("resolves the run first (404 if not found for this hospital), then paginates its allocated_costs", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({ id: "run-1" });
    (prisma.allocatedCost.findMany as jest.Mock).mockResolvedValue([{ id: "ac-1" }]);
    (prisma.allocatedCost.count as jest.Mock).mockResolvedValue(1);
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    const result = await service.findAllocatedCosts("hospital-1", "run-1", { page: 1, limit: 20 });

    const where = { allocationRunId: "run-1" };
    expect(prisma.allocatedCost.findMany).toHaveBeenCalledWith({ where, orderBy: { createdAt: "asc" }, skip: 0, take: 20 });
    expect(prisma.allocatedCost.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({ data: [{ id: "ac-1" }], meta: { page: 1, limit: 20, total: 1 } });
  });

  it("throws NotFoundException when the run doesn't exist for this hospital", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    await expect(service.findAllocatedCosts("hospital-1", "missing", { page: 1, limit: 20 })).rejects.toThrow(
      NotFoundException
    );
    expect(prisma.allocatedCost.findMany).not.toHaveBeenCalled();
  });
});

describe("AllocationRunService.recalculate", () => {
  const completedRun = {
    id: "run-1",
    hospitalId: "hospital-1",
    periodId: "period-1",
    method: "step_down",
    status: "completed",
    period: { id: "period-1", label: "2026-01", status: "open" },
  };

  it("creates a new draft run superseding the prior one, then enqueues it", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock)
      .mockResolvedValueOnce(completedRun) // the prior run lookup
      .mockResolvedValueOnce(null); // "already superseded?" check
    (prisma.allocationRun.create as jest.Mock).mockResolvedValue({
      id: "run-2",
      hospitalId: "hospital-1",
      periodId: "period-1",
      method: "step_down",
      status: "draft",
      supersedesRunId: "run-1",
    });
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    const run = await service.recalculate("hospital-1", "org-1", "run-1", "actor-1");

    expect(prisma.allocationRun.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        periodId: "period-1",
        method: "step_down",
        status: "draft",
        supersedesRunId: "run-1",
        createdByUserId: "actor-1",
      },
    });
    expect(run.id).toBe("run-2");
    expect(allocationQueueService.enqueue).toHaveBeenCalledWith("allocation.run", {
      allocationRunId: "run-2",
      hospitalId: "hospital-1",
      organizationId: "org-1",
      actorUserId: "actor-1",
    });
  });

  it("throws NotFoundException when the prior run doesn't exist for this hospital", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    await expect(service.recalculate("hospital-1", "org-1", "missing", "actor-1")).rejects.toThrow(NotFoundException);
  });

  it("rejects recalculating a run that is still 'draft' or 'running'", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({ ...completedRun, status: "running" });
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    await expect(service.recalculate("hospital-1", "org-1", "run-1", "actor-1")).rejects.toThrow(ConflictException);
    expect(prisma.allocationRun.create).not.toHaveBeenCalled();
  });

  it("rejects recalculating when the period is not open", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock).mockResolvedValue({
      ...completedRun,
      period: { ...completedRun.period, status: "locked" },
    });
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    await expect(service.recalculate("hospital-1", "org-1", "run-1", "actor-1")).rejects.toThrow(
      UnprocessableEntityException
    );
  });

  it("rejects recalculating a run that has already been superseded", async () => {
    const { prisma, auditContextService, allocationQueueService } = makeDeps();
    (prisma.allocationRun.findFirst as jest.Mock)
      .mockResolvedValueOnce(completedRun)
      .mockResolvedValueOnce({ id: "run-3", supersedesRunId: "run-1" });
    const service = new AllocationRunService(prisma, auditContextService, allocationQueueService);

    await expect(service.recalculate("hospital-1", "org-1", "run-1", "actor-1")).rejects.toThrow(ConflictException);
    expect(prisma.allocationRun.create).not.toHaveBeenCalled();
  });
});
