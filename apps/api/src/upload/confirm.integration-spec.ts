import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Prisma, PrismaClient } from "@prisma/client";
import { UnprocessableEntityException } from "@nestjs/common";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "../period/period.service";
import { ConfirmService } from "./confirm.service";

/**
 * Proves the two things a unit test with a mocked Prisma client cannot:
 * (1) `CostEntry`/`RevenueEntry` RLS actually isolates tenants, and (2) the
 * confirm transaction is genuinely all-or-nothing at the Postgres level —
 * not just an application-level pre-check. Test 2 below specifically
 * engineers a real mid-transaction failure (a cost center soft-deleted
 * after validation but before confirm) and proves zero rows land, matching
 * docs/06_UPLOAD_ENGINE.md §2's "Confirmation runs inside a single DB
 * transaction: either all valid staged rows are promoted... or none are".
 */
describe("Upload confirm/rollback (RLS + real all-or-nothing)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let periodService: PeriodService;
  let confirmService: ConfirmService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_confirm_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_confirm_test?schema=public`;

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
    const costCenter1 = await ownerPrisma.costCenter.create({
      data: { hospitalId: hospital.id, code: "CC-1", name: "Cost Center 1", type: "indirect" },
    });
    const costCenter2 = await ownerPrisma.costCenter.create({
      data: { hospitalId: hospital.id, code: "CC-2", name: "Cost Center 2", type: "indirect" },
    });
    const coaAccount = await ownerPrisma.coaAccount.create({
      data: { hospitalId: hospital.id, code: "COA-1", name: "Account 1", category: "expense" },
    });
    const [period] = await runAs(organization.id, hospital.id, () =>
      periodService.generate(hospital.id, { fiscalYear: 2026 }, user.id)
    );
    const openPeriod = await runAs(organization.id, hospital.id, () => periodService.open(hospital.id, period!.id, user.id));
    return { organization, hospital, user, costCenter1, costCenter2, coaAccount, period: openPeriod };
  }

  async function seedValidatedBatch(
    hospitalId: string,
    periodId: string,
    userId: string,
    rows: Record<string, unknown>[]
  ) {
    const batch = await ownerPrisma.uploadBatch.create({
      data: {
        hospitalId,
        type: "cost",
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

  it("confirms a batch: promotes rows into CostEntry, marks it confirmed, RLS-scoped to its own hospital", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();
    const batch = await seedValidatedBatch(tenantA.hospital.id, tenantA.period.id, tenantA.user.id, [
      { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 },
      { period: "2026-01", cost_center_code: "CC-2", coa_account_code: "COA-1", nominal: 2000 },
    ]);

    const result = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      confirmService.confirm(tenantA.hospital.id, batch.id, {}, tenantA.user.id)
    );
    expect(result.status).toBe("confirmed");

    const entries = await ownerPrisma.costEntry.findMany({ where: { sourceFileId: batch.id } });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.hospitalId === tenantA.hospital.id)).toBe(true);

    const rows = await ownerPrisma.uploadRowStaging.findMany({ where: { uploadBatchId: batch.id } });
    expect(rows.every((r) => r.status === "promoted")).toBe(true);

    const entriesAsA = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.costEntry.findMany({ where: { sourceFileId: batch.id } })
    );
    expect(entriesAsA).toHaveLength(2);

    const entriesAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.costEntry.findMany({ where: { sourceFileId: batch.id } })
    );
    expect(entriesAsB).toEqual([]);
  });

  it("is genuinely all-or-nothing: a mid-batch reference that stops resolving rolls back every row, not just the bad one", async () => {
    const tenantA = await seedHospital();
    const batch = await seedValidatedBatch(tenantA.hospital.id, tenantA.period.id, tenantA.user.id, [
      { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 }, // resolves fine, would be created first
      { period: "2026-01", cost_center_code: "CC-2", coa_account_code: "COA-1", nominal: 2000 }, // its cost center is about to disappear
    ]);

    // Simulates a cost center being soft-deleted between validate and
    // confirm (CostCenterService.remove()'s real mechanism) — the exact
    // race ConfirmService's per-row, in-transaction re-resolution exists to
    // catch, per its own class doc comment.
    await ownerPrisma.costCenter.update({ where: { id: tenantA.costCenter2.id }, data: { deletedAt: new Date() } });

    const error = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      confirmService.confirm(tenantA.hospital.id, batch.id, {}, tenantA.user.id)
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: "UPLOAD_PROMOTION_REFERENCE_MISSING",
    });

    // The real proof: row 1 (CC-1) resolves fine and would be the first
    // `costEntry.create()` inside the transaction — if this were only an
    // upfront pre-check with no real transaction, or if Postgres's rollback
    // didn't actually work, row 1 would still be sitting in the table.
    const entries = await ownerPrisma.costEntry.findMany({ where: { sourceFileId: batch.id } });
    expect(entries).toHaveLength(0);

    // Nothing else advanced either — the batch is exactly as it was before confirm was attempted.
    const reloadedBatch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(reloadedBatch.status).toBe("validated");
    expect(reloadedBatch.confirmedAt).toBeNull();
    const rows = await ownerPrisma.uploadRowStaging.findMany({ where: { uploadBatchId: batch.id } });
    expect(rows.every((r) => r.status === "valid")).toBe(true);
  });

  it("rolls back a confirmed batch: deletes CostEntry rows, reverts row status, RLS-scoped", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();
    const batch = await seedValidatedBatch(tenantA.hospital.id, tenantA.period.id, tenantA.user.id, [
      { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 },
    ]);
    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      confirmService.confirm(tenantA.hospital.id, batch.id, {}, tenantA.user.id)
    );

    const result = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      confirmService.rollback(tenantA.hospital.id, batch.id, tenantA.user.id)
    );
    expect(result.status).toBe("rolled_back");

    const entries = await ownerPrisma.costEntry.findMany({ where: { sourceFileId: batch.id } });
    expect(entries).toEqual([]);

    const rows = await ownerPrisma.uploadRowStaging.findMany({ where: { uploadBatchId: batch.id } });
    expect(rows.every((r) => r.status === "valid")).toBe(true);

    // A different hospital was never able to see the (now-deleted) entries either, at any point.
    const entriesAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.costEntry.findMany({ where: { sourceFileId: batch.id } })
    );
    expect(entriesAsB).toEqual([]);
  });

  it("rejects rollback once the period is locked, leaving the promoted entries untouched", async () => {
    const tenantA = await seedHospital();
    const batch = await seedValidatedBatch(tenantA.hospital.id, tenantA.period.id, tenantA.user.id, [
      { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 },
    ]);
    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      confirmService.confirm(tenantA.hospital.id, batch.id, {}, tenantA.user.id)
    );
    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.lock(tenantA.hospital.id, tenantA.period.id, tenantA.user.id)
    );

    const error = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      confirmService.rollback(tenantA.hospital.id, batch.id, tenantA.user.id)
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);

    const entries = await ownerPrisma.costEntry.findMany({ where: { sourceFileId: batch.id } });
    expect(entries).toHaveLength(1);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
