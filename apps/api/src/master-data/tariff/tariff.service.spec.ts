import { TariffService } from "./tariff.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditContextService } from "../../audit/audit-context.service";
import type { TenantContextService } from "../../tenancy/tenant-context.service";

/**
 * `TariffService.create()` overrides the generic engine entirely (supersede
 * transaction + `Service.currentTariff` sync, see the class doc comment in
 * tariff.service.ts) — its `findAll`/`findOne`/`update`/`remove` are
 * inherited and covered by the parameterized suite in
 * common/crud/master-data-crud.service.spec.ts instead.
 */

function makeDeps() {
  const tx = {
    $executeRaw: jest.fn(),
    tariff: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn(), create: jest.fn() },
    service: { update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;
  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  const tenantContextService = {
    get: jest.fn().mockReturnValue({ organizationId: "org-1", hospitalId: "hospital-1", userId: "actor-1" }),
    isAuthBypass: jest.fn().mockReturnValue(false),
    isOrgBootstrap: jest.fn().mockReturnValue(false),
    setManagedTransaction: jest.fn(),
  } as unknown as TenantContextService;
  return { prisma, tx, auditContextService, tenantContextService };
}

const dto = {
  serviceId: "service-1",
  currentTariff: 175_000,
  recommendedTariff: 185_000,
  effectiveDate: "2026-01-01",
};

describe("TariffService.create", () => {
  it("supersedes the previously active tariff, creates the new active row (tagged with supersedesTariffId), and syncs Service.currentTariff", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeDeps();
    tx.tariff.findFirst.mockResolvedValue({ id: "tariff-1" });
    const created = {
      id: "tariff-2",
      hospitalId: "hospital-1",
      serviceId: "service-1",
      currentTariff: 175_000,
      status: "active",
    };
    tx.tariff.create.mockResolvedValue(created);

    const service = new TariffService(prisma, auditContextService, tenantContextService);
    const result = await service.create("hospital-1", dto, "actor-1");

    expect(tx.tariff.findFirst).toHaveBeenCalledWith({
      where: { hospitalId: "hospital-1", serviceId: "service-1", status: "active", deletedAt: null },
      select: { id: true },
    });
    expect(tx.tariff.updateMany).toHaveBeenCalledWith({
      where: { id: "tariff-1" },
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
        supersedesTariffId: "tariff-1",
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

  it("does not error, and sets supersedesTariffId: null, when there is no previously active tariff to supersede (first tariff for a service)", async () => {
    const { prisma, tx, auditContextService, tenantContextService } = makeDeps();
    tx.tariff.findFirst.mockResolvedValue(null);
    const created = { id: "tariff-1", hospitalId: "hospital-1", serviceId: "service-1", currentTariff: 175_000, status: "active" };
    tx.tariff.create.mockResolvedValue(created);

    const service = new TariffService(prisma, auditContextService, tenantContextService);
    await expect(service.create("hospital-1", dto, "actor-1")).resolves.toBe(created);

    expect(tx.tariff.updateMany).not.toHaveBeenCalled();
    expect(tx.tariff.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ supersedesTariffId: null }) }));
  });
});
