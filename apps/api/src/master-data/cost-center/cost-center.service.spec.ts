import { BadRequestException } from "@nestjs/common";
import { CostCenterService } from "./cost-center.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditContextService } from "../../audit/audit-context.service";

/**
 * `CostCenterService.create()`/`update()` only override the generic engine
 * to guard the `type`/`profitCenterId` invariant (Sprint 6 sub-task 0) —
 * `findAll`/`findOne`/`remove` are inherited and covered by the
 * parameterized suite in common/crud/master-data-crud.service.spec.ts.
 */
function makeDeps() {
  const prisma = {
    costCenter: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;
  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  return { prisma, auditContextService };
}

describe("CostCenterService.create", () => {
  it("creates a direct cost center when profitCenterId is set", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.costCenter.create as jest.Mock).mockResolvedValue({ id: "cc-1", type: "direct", profitCenterId: "pc-1" });
    const service = new CostCenterService(prisma, auditContextService);

    const result = await service.create(
      "hospital-1",
      { code: "CC-LAB", name: "Lab", type: "direct", profitCenterId: "pc-1" },
      "actor-1"
    );

    expect(result).toMatchObject({ type: "direct", profitCenterId: "pc-1" });
  });

  it("creates an indirect cost center with no profitCenterId", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.costCenter.create as jest.Mock).mockResolvedValue({ id: "cc-1", type: "indirect", profitCenterId: null });
    const service = new CostCenterService(prisma, auditContextService);

    await service.create("hospital-1", { code: "CC-HRD", name: "HRD", type: "indirect" }, "actor-1");

    expect(prisma.costCenter.create).toHaveBeenCalled();
  });

  it("rejects type='indirect' with a profitCenterId set, without ever reaching Prisma", async () => {
    const { prisma, auditContextService } = makeDeps();
    const service = new CostCenterService(prisma, auditContextService);

    await expect(
      service.create("hospital-1", { code: "CC-X", name: "X", type: "indirect", profitCenterId: "pc-1" }, "actor-1")
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.costCenter.create).not.toHaveBeenCalled();
  });
});

describe("CostCenterService.update", () => {
  it("allows a partial update that doesn't touch type/profitCenterId, skipping the extra consistency guard", async () => {
    const { prisma, auditContextService } = makeDeps();
    // findFirst is still called once, by the inherited update()'s own
    // before/after audit diff — this override's extra guard only fires
    // (and would otherwise call findOne a second time) when type or
    // profitCenterId is actually part of the patch.
    (prisma.costCenter.findFirst as jest.Mock).mockResolvedValue({ id: "cc-1", type: "indirect", profitCenterId: null });
    (prisma.costCenter.update as jest.Mock).mockResolvedValue({ id: "cc-1", name: "Renamed" });
    const service = new CostCenterService(prisma, auditContextService);

    await service.update("hospital-1", "cc-1", { name: "Renamed" }, "actor-1");

    expect(prisma.costCenter.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.costCenter.update).toHaveBeenCalled();
  });

  it("rejects switching an indirect cost center's profitCenterId without also switching type to direct", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.costCenter.findFirst as jest.Mock).mockResolvedValue({
      id: "cc-1",
      type: "indirect",
      profitCenterId: null,
    });
    const service = new CostCenterService(prisma, auditContextService);

    await expect(service.update("hospital-1", "cc-1", { profitCenterId: "pc-1" }, "actor-1")).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.costCenter.update).not.toHaveBeenCalled();
  });

  it("rejects switching type to direct without providing profitCenterId, using the existing row's value", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.costCenter.findFirst as jest.Mock).mockResolvedValue({
      id: "cc-1",
      type: "indirect",
      profitCenterId: null,
    });
    const service = new CostCenterService(prisma, auditContextService);

    await expect(service.update("hospital-1", "cc-1", { type: "direct" }, "actor-1")).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("allows switching type to direct when profitCenterId is provided in the same update", async () => {
    const { prisma, auditContextService } = makeDeps();
    (prisma.costCenter.findFirst as jest.Mock).mockResolvedValue({
      id: "cc-1",
      type: "indirect",
      profitCenterId: null,
    });
    (prisma.costCenter.update as jest.Mock).mockResolvedValue({ id: "cc-1", type: "direct", profitCenterId: "pc-1" });
    const service = new CostCenterService(prisma, auditContextService);

    await service.update("hospital-1", "cc-1", { type: "direct", profitCenterId: "pc-1" }, "actor-1");

    expect(prisma.costCenter.update).toHaveBeenCalled();
  });
});
