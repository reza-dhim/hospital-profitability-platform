import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Prisma, PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "../period/period.service";
import { ConfirmService } from "./confirm.service";

/**
 * Proves the insert-only master-data upload types (asset/employee/bmhp/
 * tariff, this sub-task) end-to-end against a real Postgres transaction —
 * the two things a mocked-Prisma unit test can't demonstrate: (1) a
 * duplicate `code` genuinely collides on the live `@@unique([hospitalId,
 * code])` constraint if validation didn't already catch it, and (2)
 * tariff's supersede-on-create + rollback-restore chain is correct under
 * real sequential transactions, not just the mocked call assertions in
 * `confirm.service.spec.ts`. Asset stands in for asset/employee/bmhp (all
 * three share the exact same insert-only + soft-delete-rollback shape) —
 * only tariff gets its own scenario, since it's the structurally different
 * one (supersede, not plain insert).
 */
describe("Master-data upload promotion + rollback (asset, tariff) — real DB", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let periodService: PeriodService;
  let confirmService: ConfirmService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_master_data_upload_test")
      .withUsername("hpp")
      .withPassword("hpp")
      .start();

    const ownerUrl = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, DATABASE_URL: ownerUrl },
      stdio: "inherit",
    });

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_master_data_upload_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
    confirmService = new ConfirmService(appPrisma as never, tenantContextService, new AuditContextService());
  }, 120_000);

  afterAll(async () => {
    await ownerPrisma.$disconnect();
    await appPrisma.$disconnect();
    await container.stop();
  });

  function runAs<T>(orgId: string, hospitalId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

  async function seedHospital() {
    const organization = await ownerPrisma.organization.create({ data: { name: `Org ${randomUUID()}` } });
    const hospital = await ownerPrisma.hospital.create({
      data: { organizationId: organization.id, name: `Hospital ${randomUUID()}`, code: randomUUID().slice(0, 8) },
    });
    const user = await ownerPrisma.user.create({
      data: {
        organizationId: organization.id,
        hospitalId: hospital.id,
        name: "Actor User",
        email: `${randomUUID()}@example.test`,
        passwordHash: "irrelevant",
      },
    });
    const [period] = await runAs(organization.id, hospital.id, () =>
      periodService.generate(hospital.id, { fiscalYear: 2026 }, user.id)
    );
    const openPeriod = await runAs(organization.id, hospital.id, () => periodService.open(hospital.id, period!.id, user.id));
    return { organization, hospital, user, period: openPeriod };
  }

  async function seedValidatedBatch(
    hospitalId: string,
    periodId: string,
    userId: string,
    type: "asset" | "tariff",
    rows: Record<string, unknown>[]
  ) {
    const batch = await ownerPrisma.uploadBatch.create({
      data: {
        hospitalId,
        type,
        periodId,
        fileName: "batch.xlsx",
        fileUrl: "irrelevant",
        uploadedByUserId: userId,
        status: "validated",
      },
    });
    await ownerPrisma.uploadRowStaging.createMany({
      data: rows.map((rawJson, index) => ({
        uploadBatchId: batch.id,
        rowNumber: index + 1,
        rawJson: rawJson as Prisma.InputJsonValue,
        status: "valid",
      })),
    });
    return batch;
  }

  describe("asset (insert-only, representative of asset/employee/bmhp)", () => {
    it("confirms into Asset tagged with sourceFileId, then rollback soft-deletes only that batch's rows", async () => {
      const tenant = await seedHospital();
      const batch = await seedValidatedBatch(tenant.hospital.id, tenant.period.id, tenant.user.id, "asset", [
        {
          code: "AST-001",
          name: "USG Machine",
          category: "medical-equipment",
          acquisition_cost: 250000000,
          depreciation_method: "straight-line",
          useful_life_months: 60,
        },
      ]);

      const confirmed = await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.confirm(tenant.hospital.id, batch.id, {}, tenant.user.id)
      );
      expect(confirmed.status).toBe("confirmed");

      const assets = await ownerPrisma.asset.findMany({ where: { sourceFileId: batch.id } });
      expect(assets).toHaveLength(1);
      expect(assets[0]).toMatchObject({ code: "AST-001", hospitalId: tenant.hospital.id, deletedAt: null });

      const rolledBack = await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.rollback(tenant.hospital.id, batch.id, tenant.user.id)
      );
      expect(rolledBack.status).toBe("rolled_back");

      const afterRollback = await ownerPrisma.asset.findUniqueOrThrow({ where: { id: assets[0]!.id } });
      expect(afterRollback.deletedAt).not.toBeNull();
    });

    it("is genuinely all-or-nothing on a real unique-constraint collision — a code that already exists live aborts the whole batch", async () => {
      const tenant = await seedHospital();
      await ownerPrisma.asset.create({
        data: {
          hospitalId: tenant.hospital.id,
          code: "AST-DUP",
          name: "Existing Asset",
          category: "medical-equipment",
          acquisitionCost: 1,
          depreciationMethod: "straight-line",
          usefulLifeMonths: 12,
        },
      });
      const batch = await seedValidatedBatch(tenant.hospital.id, tenant.period.id, tenant.user.id, "asset", [
        {
          code: "AST-NEW",
          name: "New Asset",
          category: "medical-equipment",
          acquisition_cost: 1000,
          depreciation_method: "straight-line",
          useful_life_months: 12,
        },
        // Duplicates a code that already exists live — validation should
        // normally catch this (row-validation-rules.spec.ts), but this test
        // simulates it slipping through to confirm time (e.g. a race), and
        // proves the real P2002 aborts row 1's insert too, not just row 2's.
        {
          code: "AST-DUP",
          name: "Colliding Asset",
          category: "medical-equipment",
          acquisition_cost: 2000,
          depreciation_method: "straight-line",
          useful_life_months: 24,
        },
      ]);

      const error = await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.confirm(tenant.hospital.id, batch.id, {}, tenant.user.id)
      ).catch((e: unknown) => e);
      expect(error).toBeTruthy();

      const newAsset = await ownerPrisma.asset.findFirst({ where: { code: "AST-NEW" } });
      expect(newAsset).toBeNull();
      const reloadedBatch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: batch.id } });
      expect(reloadedBatch.status).toBe("validated");
    });
  });

  describe("tariff (supersede-on-create, append-only history)", () => {
    async function seedService(hospitalId: string) {
      const profitCenter = await ownerPrisma.profitCenter.create({
        data: { hospitalId, code: "RJ", name: "Rawat Jalan" },
      });
      return ownerPrisma.service.create({
        data: { hospitalId, profitCenterId: profitCenter.id, code: "SVC-1", name: "Konsultasi", serviceType: "consultation" },
      });
    }

    it("confirms a tariff row: supersedes nothing (first ever), sets Service.currentTariff, then rollback nulls it back out", async () => {
      const tenant = await seedHospital();
      const service = await seedService(tenant.hospital.id);
      const batch = await seedValidatedBatch(tenant.hospital.id, tenant.period.id, tenant.user.id, "tariff", [
        { service_code: "SVC-1", current_tariff: 150000, recommended_tariff: 175000, effective_date: "2026-08-01" },
      ]);

      const confirmed = await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.confirm(tenant.hospital.id, batch.id, {}, tenant.user.id)
      );
      expect(confirmed.status).toBe("confirmed");

      const tariff = await ownerPrisma.tariff.findFirstOrThrow({ where: { sourceFileId: batch.id } });
      expect(tariff).toMatchObject({ status: "active", supersedesTariffId: null });
      expect(tariff.currentTariff.toNumber()).toBe(150000);

      const serviceAfterConfirm = await ownerPrisma.service.findUniqueOrThrow({ where: { id: service.id } });
      expect(serviceAfterConfirm.currentTariff?.toNumber()).toBe(150000);

      await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.rollback(tenant.hospital.id, batch.id, tenant.user.id)
      );

      const tariffAfterRollback = await ownerPrisma.tariff.findUniqueOrThrow({ where: { id: tariff.id } });
      expect(tariffAfterRollback.deletedAt).not.toBeNull();
      const serviceAfterRollback = await ownerPrisma.service.findUniqueOrThrow({ where: { id: service.id } });
      expect(serviceAfterRollback.currentTariff).toBeNull();
    });

    it("supersedes a prior active tariff on confirm, and rollback restores that prior tariff + Service.currentTariff", async () => {
      const tenant = await seedHospital();
      const service = await seedService(tenant.hospital.id);
      const priorTariff = await ownerPrisma.tariff.create({
        data: {
          hospitalId: tenant.hospital.id,
          serviceId: service.id,
          currentTariff: 100000,
          effectiveDate: new Date("2026-01-01"),
          status: "active",
        },
      });
      await ownerPrisma.service.update({ where: { id: service.id }, data: { currentTariff: 100000 } });

      const batch = await seedValidatedBatch(tenant.hospital.id, tenant.period.id, tenant.user.id, "tariff", [
        { service_code: "SVC-1", current_tariff: 150000, recommended_tariff: null, effective_date: "2026-08-01" },
      ]);
      await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.confirm(tenant.hospital.id, batch.id, {}, tenant.user.id)
      );

      const priorAfterConfirm = await ownerPrisma.tariff.findUniqueOrThrow({ where: { id: priorTariff.id } });
      expect(priorAfterConfirm.status).toBe("superseded");
      const newTariff = await ownerPrisma.tariff.findFirstOrThrow({ where: { sourceFileId: batch.id } });
      expect(newTariff.supersedesTariffId).toBe(priorTariff.id);

      await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.rollback(tenant.hospital.id, batch.id, tenant.user.id)
      );

      const priorAfterRollback = await ownerPrisma.tariff.findUniqueOrThrow({ where: { id: priorTariff.id } });
      expect(priorAfterRollback.status).toBe("active");
      const serviceAfterRollback = await ownerPrisma.service.findUniqueOrThrow({ where: { id: service.id } });
      expect(serviceAfterRollback.currentTariff?.toNumber()).toBe(100000);
    });

    it("rejects rollback once a batch-created tariff has been superseded by a change outside that batch", async () => {
      const tenant = await seedHospital();
      const service = await seedService(tenant.hospital.id);
      const batch = await seedValidatedBatch(tenant.hospital.id, tenant.period.id, tenant.user.id, "tariff", [
        { service_code: "SVC-1", current_tariff: 150000, recommended_tariff: null, effective_date: "2026-08-01" },
      ]);
      await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.confirm(tenant.hospital.id, batch.id, {}, tenant.user.id)
      );

      // A later, independent tariff change for the same service — outside
      // this batch (mirrors what `TariffService.create()` itself does:
      // supersede + insert + sync `Service.currentTariff`, all together).
      await runAs(tenant.organization.id, tenant.hospital.id, () =>
        ownerPrisma.$transaction(async (tx) => {
          await tx.tariff.updateMany({
            where: { hospitalId: tenant.hospital.id, serviceId: service.id, status: "active" },
            data: { status: "superseded" },
          });
          await tx.tariff.create({
            data: {
              hospitalId: tenant.hospital.id,
              serviceId: service.id,
              currentTariff: 999999,
              effectiveDate: new Date("2026-09-01"),
              status: "active",
            },
          });
          await tx.service.update({ where: { id: service.id }, data: { currentTariff: 999999 } });
        })
      );

      const error = await runAs(tenant.organization.id, tenant.hospital.id, () =>
        confirmService.rollback(tenant.hospital.id, batch.id, tenant.user.id)
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: "UPLOAD_ROLLBACK_NOT_SUPPORTED" });

      const reloadedBatch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: batch.id } });
      expect(reloadedBatch.status).toBe("confirmed"); // unchanged — rollback never proceeded
      const serviceUnchanged = await ownerPrisma.service.findUniqueOrThrow({ where: { id: service.id } });
      expect(serviceUnchanged.currentTariff?.toNumber()).toBe(999999); // the external change is still intact
    });
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
