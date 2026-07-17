import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "./period.service";

/**
 * Proves the `periods` RLS policy (added in
 * `prisma/migrations/20260717123732_add_periods`, same hospital-scoped shape
 * as `cost_centers`/`tariffs`) actually isolates tenants, and that the
 * generate -> open -> lock -> reopen lifecycle persists correctly against a
 * real Postgres. Mirrors the setup in
 * `prisma/tenant-isolation.integration-spec.ts`.
 */
describe("Period lifecycle (RLS)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerUrl: string;
  let appUrl: string;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let periodService: PeriodService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_period_test")
      .withUsername("hpp")
      .withPassword("hpp")
      .start();

    ownerUrl = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, DATABASE_URL: ownerUrl },
      stdio: "inherit",
    });

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_period_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
  }, 120_000);

  afterAll(async () => {
    await ownerPrisma.$disconnect();
    await appPrisma.$disconnect();
    await container.stop();
  });

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
    return { organization, hospital, user };
  }

  function runAs<T>(orgId: string, hospitalId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

  it("generate() creates 12 periods visible only to their own hospital under RLS", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const created = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.generate(tenantA.hospital.id, { fiscalYear: 2026 }, tenantA.user.id)
    );
    expect(created).toHaveLength(12);
    expect(created.map((p) => p.label)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`)
    );

    const rowsAsA = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.period.findMany({ where: { hospitalId: tenantA.hospital.id } })
    );
    expect(rowsAsA).toHaveLength(12);

    const rowsAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.period.findMany({ where: { hospitalId: tenantA.hospital.id } })
    );
    expect(rowsAsB).toEqual([]);
  });

  it("rejects generating the same fiscal year twice for the same hospital (real unique-constraint round trip)", async () => {
    const tenantA = await seedHospital();

    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.generate(tenantA.hospital.id, { fiscalYear: 2027 }, tenantA.user.id)
    );

    const error = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.generate(tenantA.hospital.id, { fiscalYear: 2027 }, tenantA.user.id)
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
  });

  it("does not let one hospital lock, close, or reopen another hospital's period", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const [period] = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.generate(tenantA.hospital.id, { fiscalYear: 2028 }, tenantA.user.id)
    );

    await expect(
      runAs(tenantB.organization.id, tenantB.hospital.id, () =>
        periodService.open(tenantB.hospital.id, period!.id, tenantB.user.id)
      )
    ).rejects.toThrow();

    const stillDraft = await ownerPrisma.period.findUniqueOrThrow({ where: { id: period!.id } });
    expect(stillDraft.status).toBe("draft");
  });

  it("runs the full generate -> open -> lock -> close -> reopen lifecycle and persists every timestamp", async () => {
    const tenantA = await seedHospital();

    const periods = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.generate(tenantA.hospital.id, { fiscalYear: 2029 }, tenantA.user.id)
    );
    const periodId = periods[0]!.id;

    const opened = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.open(tenantA.hospital.id, periodId, tenantA.user.id)
    );
    expect(opened.status).toBe("open");

    const locked = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.lock(tenantA.hospital.id, periodId, tenantA.user.id)
    );
    expect(locked.status).toBe("locked");
    expect(locked.lockedAt).not.toBeNull();

    const closed = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.close(tenantA.hospital.id, periodId, tenantA.user.id)
    );
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();

    const reopened = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.reopen(tenantA.hospital.id, periodId, { reason: "Board correction" }, tenantA.user.id)
    );
    expect(reopened.status).toBe("open");
    expect(reopened.reopenedAt).not.toBeNull();

    // lockedAt/closedAt are historical markers, not cleared by reopening.
    expect(reopened.lockedAt).not.toBeNull();
    expect(reopened.closedAt).not.toBeNull();
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
