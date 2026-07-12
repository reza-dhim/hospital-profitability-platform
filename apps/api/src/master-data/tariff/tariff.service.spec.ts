import { TariffService } from "./tariff.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditContextService } from "../../audit/audit-context.service";

/**
 * `TariffService.create()` overrides the generic engine entirely (supersede
 * transaction + `Service.currentTariff` sync, see the class doc comment in
 * tariff.service.ts) — its `findAll`/`findOne`/`update`/`remove` are
 * inherited and covered by the parameterized suite in
 * common/crud/master-data-crud.service.spec.ts instead.
 */

function makeDeps() {
  const tx = {
    tariff: { updateMany: jest.fn(), create: jest.fn() },
    service: { update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;
  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  return { prisma, tx, auditContextService };
}

const dto = {
  serviceId: "service-1",
  currentTariff: 175_000,
  recommendedTariff: 185_000,
  effectiveDate: "2026-01-01",
};

describe("TariffService.create", () => {
  it("supersedes the previously active tariff, creates the new active row, and syncs Service.currentTariff", async () => {
    const { prisma, tx, auditContextService } = makeDeps();
    tx.tariff.updateMany.mockResolvedValue({ count: 1 });
    const created = {
      id: "tariff-2",
      hospitalId: "hospital-1",
      serviceId: "service-1",
      currentTariff: 175_000,
      status: "active",
    };
    tx.tariff.create.mockResolvedValue(created);

    const service = new TariffService(prisma, auditContextService);
    const result = await service.create("hospital-1", dto, "actor-1");

    expect(tx.tariff.updateMany).toHaveBeenCalledWith({
      where: { hospitalId: "hospital-1", serviceId: "service-1", status: "active", deletedAt: null },
      data: { status: "superseded", updatedByUserId: "actor-1" },
    });
    expect(tx.tariff.create).toHaveBeenCalledWith({
      data: {
        hospitalId: "hospital-1",
        serviceId: "service-1",
        currentTariff: 175_000,
        recommendedTariff: 185_000,
        effectiveDate: new Date("2026-01-01"),
        approvedByUserId: "actor-1",
        approvedAt: expect.any(Date),
        status: "active",
        createdByUserId: "actor-1",
        updatedByUserId: "actor-1",
      },
    });
    expect(tx.service.update).toHaveBeenCalledWith({
      where: { id: "service-1" },
      data: { currentTariff: 175_000 },
    });
    expect(result).toBe(created);
    expect(auditContextService.record).toHaveBeenCalledWith({
      entity: "tariff",
      action: "tariff.create",
      entityId: "tariff-2",
      before: null,
      after: created,
    });
  });

  it("does not error when there is no previously active tariff to supersede (first tariff for a service)", async () => {
    const { prisma, tx, auditContextService } = makeDeps();
    tx.tariff.updateMany.mockResolvedValue({ count: 0 });
    const created = { id: "tariff-1", hospitalId: "hospital-1", serviceId: "service-1", currentTariff: 175_000, status: "active" };
    tx.tariff.create.mockResolvedValue(created);

    const service = new TariffService(prisma, auditContextService);
    await expect(service.create("hospital-1", dto, "actor-1")).resolves.toBe(created);
  });
});
