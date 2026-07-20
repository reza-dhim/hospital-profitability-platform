import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Prisma, PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "../period/period.service";
import { ValidateService } from "./validate.service";

/**
 * Proves `ValidateService`'s master-data lookups AND — the genuinely risky
 * part — its historical-data queries for `E_DUPLICATE_ROW`/
 * `W_OUTLIER_NOMINAL` are correctly hospital-scoped under real RLS. Those
 * queries source from `upload_rows_staging` rows with `status: 'promoted'`
 * across potentially many prior `upload_batches`; a mocked-Prisma unit test
 * cannot prove another hospital's promoted history is actually invisible —
 * only a real Postgres session can.
 */
describe("Upload validation (RLS)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let periodService: PeriodService;
  let validateService: ValidateService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_validate_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_validate_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
    validateService = new ValidateService(appPrisma as never, tenantContextService);
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
    await ownerPrisma.costCenter.create({ data: { hospitalId: hospital.id, code: "CC-1", name: "Cost Center 1", type: "indirect" } });
    await ownerPrisma.coaAccount.create({ data: { hospitalId: hospital.id, code: "COA-1", name: "Account 1", category: "expense" } });
    return { organization, hospital, user };
  }

  async function seedPeriods(hospitalId: string, fiscalYear: number, userId: string, organizationId: string) {
    return runAs(organizationId, hospitalId, () => periodService.generate(hospitalId, { fiscalYear }, userId));
  }

  /** Simulates a prior batch's confirm/promote (Sprint 4 sub-task 6, not built yet) by seeding an already-`promoted` staging row directly. */
  async function seedPromotedRow(hospitalId: string, periodId: string, rawJson: Record<string, unknown>) {
    const batch = await ownerPrisma.uploadBatch.create({
      data: {
        hospitalId,
        type: "cost",
        periodId,
        fileName: "prior.xlsx",
        fileUrl: "irrelevant",
        uploadedByUserId: (await ownerPrisma.user.findFirstOrThrow({ where: { hospitalId } })).id,
        status: "confirmed",
      },
    });
    await ownerPrisma.uploadRowStaging.create({
      data: { uploadBatchId: batch.id, rowNumber: 1, rawJson: rawJson as Prisma.InputJsonValue, status: "promoted" },
    });
  }

  async function createValidatingBatch(hospitalId: string, periodId: string, rows: Record<string, unknown>[]) {
    const user = await ownerPrisma.user.findFirstOrThrow({ where: { hospitalId } });
    const batch = await ownerPrisma.uploadBatch.create({
      data: {
        hospitalId,
        type: "cost",
        periodId,
        fileName: "current.xlsx",
        fileUrl: "irrelevant",
        uploadedByUserId: user.id,
        status: "validating",
      },
    });
    await ownerPrisma.uploadRowStaging.createMany({
      data: rows.map((rawJson, index) => ({
        uploadBatchId: batch.id,
        rowNumber: index + 1,
        rawJson: rawJson as Prisma.InputJsonValue,
      })),
    });
    return batch;
  }

  it("validates against real master data and writes an RLS-scoped E_INVALID_COST_CENTER row for an unknown code", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();
    const [periodA] = await seedPeriods(tenantA.hospital.id, 2026, tenantA.user.id, tenantA.organization.id);

    const batch = await createValidatingBatch(tenantA.hospital.id, periodA!.id, [
      { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 },
      { period: "2026-01", cost_center_code: "CC-UNKNOWN", coa_account_code: "COA-1", nominal: 1000 },
    ]);

    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      validateService.processValidate({
        uploadBatchId: batch.id,
        hospitalId: tenantA.hospital.id,
        organizationId: tenantA.organization.id,
        uploadedByUserId: tenantA.user.id,
      })
    );

    const updated = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(updated.status).toBe("failed");
    expect(updated.errorCount).toBe(1);

    const errorsAsA = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.validationError.findMany({ where: { uploadBatchId: batch.id } })
    );
    expect(errorsAsA).toHaveLength(1);
    expect(errorsAsA[0]).toMatchObject({ errorCode: "E_INVALID_COST_CENTER" });

    const errorsAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.validationError.findMany({ where: { uploadBatchId: batch.id } })
    );
    expect(errorsAsB).toEqual([]);
  });

  it("never lets another hospital's promoted history leak into duplicate detection or outlier baselines", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();
    const periodsA = await seedPeriods(tenantA.hospital.id, 2026, tenantA.user.id, tenantA.organization.id);
    const periodsB = await seedPeriods(tenantB.hospital.id, 2026, tenantB.user.id, tenantB.organization.id);
    // periodsA/B[0..2] = Jan/Feb/Mar 2026 (chronological); use index 3 (April) as "current".
    const [janA, febA, marA, aprA] = periodsA;
    const [janB, , , aprB] = periodsB;

    // Tenant A's own real baseline: ~1000 nominal across 3 prior periods.
    await seedPromotedRow(tenantA.hospital.id, janA!.id, { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 });
    await seedPromotedRow(tenantA.hospital.id, febA!.id, { period: "2026-02", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1050 });
    await seedPromotedRow(tenantA.hospital.id, marA!.id, { period: "2026-03", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 950 });

    // Tenant B's history: wildly different scale (would trigger a false
    // outlier for tenant A's normal value if it ever leaked in) and an
    // identical natural key to what tenant A is about to upload (would
    // trigger a false duplicate if it ever leaked in).
    await seedPromotedRow(tenantB.hospital.id, janB!.id, { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 50_000_000 });
    await seedPromotedRow(tenantB.hospital.id, aprB!.id, { period: "2026-04", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1_000_000 });

    const batch = await createValidatingBatch(tenantA.hospital.id, aprA!.id, [
      { period: "2026-04", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1_000_000 }, // same key/value as tenant B's April row
    ]);

    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      validateService.processValidate({
        uploadBatchId: batch.id,
        hospitalId: tenantA.hospital.id,
        organizationId: tenantA.organization.id,
        uploadedByUserId: tenantA.user.id,
      })
    );

    const errors = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.validationError.findMany({ where: { uploadBatchId: batch.id } })
    );
    const codes = errors.map((e) => e.errorCode);

    // Duplicate check: tenant B has an identical natural key in this same
    // period — if it leaked in, this would be E_DUPLICATE_ROW. It must not.
    expect(codes).not.toContain("E_DUPLICATE_ROW");

    // Outlier check, the more precise proof: tenant A's OWN baseline
    // (~1000, from 3 prior periods) makes 1,000,000 a decisive outlier.
    // Tenant B's baseline (mean ~25.5M, stddev ~24.5M, from its 50M/1M
    // history) would NOT flag 1,000,000 at all — and if B's huge values
    // leaked into a MIXED baseline, the inflated stddev could just as
    // easily mask the outlier instead of flagging it. Seeing the flag fire
    // here is a specific signal that only tenant A's own small-scale
    // history was used, not merely "no crash".
    expect(codes).toContain("W_OUTLIER_NOMINAL");

    const updated = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(updated.status).toBe("validated"); // W_OUTLIER_NOMINAL/duplicate are warnings — they don't fail the batch.
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
