import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Prisma, PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "./tenant-rls.extension";
import { TariffService } from "../master-data/tariff/tariff.service";
import { RoleService } from "../rbac/role.service";

/**
 * Proves RLS actually blocks cross-tenant access at the database layer
 * (docs/03_MULTI_TENANT.md §2, §6 — "no query path can return another
 * tenant's rows"). A unit test with a mocked `PrismaService` cannot verify
 * this: the mock never sends SQL to Postgres, so no policy is ever
 * evaluated. This suite needs a real Postgres, which is why it lives in
 * `*.integration-spec.ts` (a separate Jest project, `pnpm test:integration`)
 * rather than the default `*.spec.ts` unit-test run.
 */
describe("Tenant isolation (RLS)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerUrl: string;
  let appUrl: string;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_rls_test")
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
    appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_rls_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);

    await ownerPrisma.$connect();
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

  function runAs(orgId: string, hospitalId: string | null, fn: () => Promise<unknown>) {
    // Must `await` inside the `runWithNewStore` callback, not just return
    // `fn()`'s promise — Node's AsyncLocalStorage only reliably keeps the
    // store alive for continuations that happen while the callback itself
    // is still "running" (i.e. genuinely async and awaited internally), not
    // for whatever a synchronous callback merely hands back unawaited. This
    // matches `TenantMiddleware`'s production fix (see its doc comment).
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

  it("only returns the active hospital's rows for a hospital-scoped table", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const costCenterA = await ownerPrisma.costCenter.create({
      data: { hospitalId: tenantA.hospital.id, code: "CC-A", name: "Cost Center A", type: "indirect" },
    });
    await ownerPrisma.costCenter.create({
      data: { hospitalId: tenantB.hospital.id, code: "CC-B", name: "Cost Center B", type: "indirect" },
    });

    const rowsAsA = (await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.costCenter.findMany({ where: { hospitalId: { in: [tenantA.hospital.id, tenantB.hospital.id] } } })
    )) as { id: string }[];

    expect(rowsAsA).toHaveLength(1);
    expect(rowsAsA[0]?.id).toBe(costCenterA.id);
  });

  it("returns zero rows when no tenant context is set at all — never silently returns everything", async () => {
    await seedHospital();
    const rows = await appPrisma.costCenter.findMany({});
    expect(rows).toEqual([]);
  });

  it("does not let one hospital update or delete another hospital's row", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();
    const costCenterB = await ownerPrisma.costCenter.create({
      data: { hospitalId: tenantB.hospital.id, code: "CC-B2", name: "Cost Center B2", type: "indirect" },
    });

    await expect(
      runAs(tenantA.organization.id, tenantA.hospital.id, () =>
        appPrisma.costCenter.update({ where: { id: costCenterB.id }, data: { name: "Hijacked" } })
      )
    ).rejects.toThrow();

    const stillIntact = await ownerPrisma.costCenter.findUniqueOrThrow({ where: { id: costCenterB.id } });
    expect(stillIntact.name).toBe("Cost Center B2");
  });

  it("still allows creating a brand-new organization from an existing tenant's session", async () => {
    const tenantA = await seedHospital();

    const created = (await runAs(tenantA.organization.id, tenantA.hospital.id, () => {
      tenantContextService.setOrgBootstrap();
      return appPrisma.organization.create({ data: { name: `Bootstrapped ${randomUUID()}` } });
    })) as { id: string };

    expect(created.id).not.toBe(tenantA.organization.id);
    const fetched = await ownerPrisma.organization.findUniqueOrThrow({ where: { id: created.id } });
    expect(fetched).toBeTruthy();
  });

  it("keeps TariffService.create atomic and correctly tenant-scoped under RLS (nested transaction)", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const profitCenter = await ownerPrisma.profitCenter.create({
      data: { hospitalId: tenantA.hospital.id, code: "PC-1", name: "PC 1" },
    });
    const service = await ownerPrisma.service.create({
      data: {
        hospitalId: tenantA.hospital.id,
        profitCenterId: profitCenter.id,
        code: "SVC-1",
        name: "Service 1",
        serviceType: "outpatient",
      },
    });
    const firstTariff = await ownerPrisma.tariff.create({
      data: {
        hospitalId: tenantA.hospital.id,
        serviceId: service.id,
        currentTariff: new Prisma.Decimal(100),
        effectiveDate: new Date("2026-01-01"),
        status: "active",
      },
    });

    const tariffService = new TariffService(appPrisma as never, new AuditContextService(), tenantContextService);

    const created = (await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      tariffService.create(
        tenantA.hospital.id,
        {
          serviceId: service.id,
          currentTariff: 150,
          effectiveDate: "2026-02-01",
        } as never,
        tenantA.user.id
      )
    )) as { id: string; status: string };

    expect(created.status).toBe("active");

    const supersededFirst = await ownerPrisma.tariff.findUniqueOrThrow({ where: { id: firstTariff.id } });
    expect(supersededFirst.status).toBe("superseded");

    const updatedService = await ownerPrisma.service.findUniqueOrThrow({ where: { id: service.id } });
    expect(updatedService.currentTariff?.toString()).toBe("150");

    // Cross-tenant: tenant B must never see tenant A's tariff rows.
    const rowsAsB = (await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.tariff.findMany({ where: { serviceId: service.id } })
    )) as unknown[];
    expect(rowsAsB).toEqual([]);
  });

  it("keeps RoleService.assignPermissions atomic under RLS (array-form nested transaction)", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const role = await ownerPrisma.role.create({
      data: { hospitalId: tenantA.hospital.id, name: "custom_role" },
    });
    const permission = await ownerPrisma.permission.upsert({
      where: { code: "master_data.read" },
      create: { code: "master_data.read", name: "Read master data" },
      update: {},
    });

    const roleService = new RoleService(appPrisma as never, tenantContextService);

    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      roleService.assignPermissions(tenantA.hospital.id, role.id, [permission.code], tenantA.user.id)
    );

    const assigned = await ownerPrisma.rolePermission.findMany({ where: { roleId: role.id } });
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.permissionId).toBe(permission.id);

    // Tenant B must not be able to see or modify tenant A's role.
    const rowsAsB = (await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.role.findMany({ where: { id: role.id } })
    )) as unknown[];
    expect(rowsAsB).toEqual([]);
  });

  it("lets login look up a user by email before any tenant is known (auth_bypass), but not otherwise", async () => {
    const tenantA = await seedHospital();

    const foundWithBypass = await tenantContextService.runWithNewStore(async () => {
      tenantContextService.setAuthBypass();
      return await appPrisma.user.findUnique({ where: { email: tenantA.user.email } });
    });
    expect((foundWithBypass as { id: string } | null)?.id).toBe(tenantA.user.id);

    const foundWithoutContext = await tenantContextService.runWithNewStore(async () =>
      appPrisma.user.findUnique({ where: { email: tenantA.user.email } })
    );
    expect(foundWithoutContext).toBeNull();
  });

  it("lets a public-route audit row (null hospital_id) insert — visible to any hospital-scoped session since audit_logs has no organization_id column to scope by", async () => {
    const tenantA = await seedHospital();

    const inserted = await tenantContextService.runWithNewStore(async () => {
      tenantContextService.setAuthBypass();
      return await appPrisma.auditLog.create({
        data: { hospitalId: null, action: "auth.login_failed", entity: "user" },
      });
    });
    expect((inserted as { id: string }).id).toBeTruthy();

    const rowsAsA = (await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.auditLog.findMany({ where: { action: "auth.login_failed" } })
    )) as { id: string }[];
    expect(rowsAsA.map((r) => r.id)).toContain((inserted as { id: string }).id);
  });

  it("scopes a null-hospital bootstrap audit row (POST /organizations, /hospitals) to its own organization via the acting user's user_id", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    // Simulates the audit row AuditInterceptor writes for an authenticated
    // caller with no active hospital yet (e.g. bootstrapping their very
    // first hospital under a brand-new organization) — hospital_id is
    // null, but user_id is the real, authenticated actor.
    const bootstrapRow = (await runAs(tenantA.organization.id, null, () =>
      appPrisma.auditLog.create({
        data: {
          hospitalId: null,
          userId: tenantA.user.id,
          action: "hospitals.create",
          entity: "hospitals",
          entityId: tenantA.hospital.id,
        },
      })
    )) as { id: string };
    expect(bootstrapRow.id).toBeTruthy();

    const rowsAsOwnOrg = (await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.auditLog.findMany({ where: { action: "hospitals.create" } })
    )) as { id: string }[];
    expect(rowsAsOwnOrg.map((r) => r.id)).toContain(bootstrapRow.id);

    // The fix under test: a different organization must NOT see it, even
    // though hospital_id is null on both sides — this previously leaked
    // (Option C narrows the blanket `hospital_id IS NULL` SELECT allowance
    // to a join against the row's own user_id / organization_id).
    const rowsAsOtherOrg = (await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.auditLog.findMany({ where: { action: "hospitals.create" } })
    )) as { id: string }[];
    expect(rowsAsOtherOrg.map((r) => r.id)).not.toContain(bootstrapRow.id);
  });

  it("never lets the app's runtime role update or delete an audit_logs row — append-only at the DB layer, not just app-level convention (docs/14_SECURITY.md §6)", async () => {
    const tenantA = await seedHospital();
    const row = (await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.auditLog.create({
        data: { hospitalId: tenantA.hospital.id, userId: tenantA.user.id, action: "test.append_only", entity: "test" },
      })
    )) as { id: string };

    // `REVOKE UPDATE, DELETE ON audit_logs FROM hpp_app` (migration
    // 20260713120000) — this must fail on the GRANT itself, before RLS
    // policy evaluation even runs, so it holds regardless of tenant context.
    await expect(
      runAs(tenantA.organization.id, tenantA.hospital.id, () =>
        appPrisma.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })
      )
    ).rejects.toThrow();

    await expect(
      runAs(tenantA.organization.id, tenantA.hospital.id, () => appPrisma.auditLog.delete({ where: { id: row.id } }))
    ).rejects.toThrow();

    const stillIntact = await ownerPrisma.auditLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(stillIntact.action).toBe("test.append_only");
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
