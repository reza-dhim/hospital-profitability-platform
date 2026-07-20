import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "../period/period.service";
import { TargetMarginService } from "./target-margin.service";

/**
 * Sprint 6 sub-task 0: proves the `target_margins` RLS policy (plain
 * hospital-scoped, added in
 * `prisma/migrations/20260720040243_add_target_margins_and_cost_center_type`),
 * its `scope_id`-matches-`scope_type` CHECK constraint, and the new
 * `cost_centers.type`/`profit_center_id` direct-cost-attribution CHECK,
 * against a real Postgres.
 */
describe("Target margins + cost center direct-cost link (RLS + CHECK)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let periodService: PeriodService;
  let targetMarginService: TargetMarginService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_target_margin_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_target_margin_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
    targetMarginService = new TargetMarginService(appPrisma as never, new AuditContextService());
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
    const profitCenter = await ownerPrisma.profitCenter.create({
      data: { hospitalId: hospital.id, code: "RJ", name: "Rawat Jalan" },
    });
    const [period] = await runAs(organization.id, hospital.id, () =>
      periodService.generate(hospital.id, { fiscalYear: 2026 }, user.id)
    );
    return { organization, hospital, user, profitCenter, period: period! };
  }

  it("create() persists a target margin visible only to its own hospital under RLS", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const created = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      targetMarginService.create(
        tenantA.hospital.id,
        { scopeType: "profit_center", scopeId: tenantA.profitCenter.id, targetMargin: 18, effectivePeriodId: tenantA.period.id },
        tenantA.user.id
      )
    );
    expect(created.targetMargin.toNumber()).toBe(18);

    const rowsAsA = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.targetMargin.findMany({ where: { id: created.id } })
    );
    expect(rowsAsA).toHaveLength(1);

    const rowsAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.targetMargin.findMany({ where: { id: created.id } })
    );
    expect(rowsAsB).toEqual([]);
  });

  it("rejects a target margin whose effectivePeriodId belongs to a different hospital", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    await expect(
      runAs(tenantB.organization.id, tenantB.hospital.id, () =>
        targetMarginService.create(
          tenantB.hospital.id,
          { scopeType: "hospital", targetMargin: 12, effectivePeriodId: tenantA.period.id },
          tenantB.user.id
        )
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a target_margins row with scope_type=hospital and a non-null scope_id via the DB CHECK constraint", async () => {
    const tenantA = await seedHospital();

    await expect(
      ownerPrisma.targetMargin.create({
        data: {
          hospitalId: tenantA.hospital.id,
          scopeType: "hospital",
          scopeId: tenantA.profitCenter.id,
          targetMargin: 12,
          effectivePeriodId: tenantA.period.id,
          setByUserId: tenantA.user.id,
        },
      })
    ).rejects.toThrow();
  });

  it("resolveForService carries a profit_center-scope margin forward across periods for its own hospital only", async () => {
    const tenantA = await seedHospital();
    const service = await ownerPrisma.service.create({
      data: { hospitalId: tenantA.hospital.id, profitCenterId: tenantA.profitCenter.id, code: "SVC-1", name: "Konsultasi", serviceType: "consultation" },
    });
    const laterPeriods = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      periodService.generate(tenantA.hospital.id, { fiscalYear: 2027 }, tenantA.user.id)
    );

    await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      targetMarginService.create(
        tenantA.hospital.id,
        { scopeType: "profit_center", scopeId: tenantA.profitCenter.id, targetMargin: 22, effectivePeriodId: tenantA.period.id },
        tenantA.user.id
      )
    );

    const resolved = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      targetMarginService.resolveForService(tenantA.hospital.id, laterPeriods[2]!.id, service.id, tenantA.profitCenter.id)
    );
    expect(resolved.toNumber()).toBe(22);
  });

  it("rejects a direct cost center with no profit_center_id via the DB CHECK constraint", async () => {
    const tenantA = await seedHospital();

    await expect(
      ownerPrisma.costCenter.create({
        data: { hospitalId: tenantA.hospital.id, code: "CC-LAB", name: "Lab", type: "direct" },
      })
    ).rejects.toThrow();
  });

  it("rejects an indirect cost center that sets profit_center_id via the DB CHECK constraint", async () => {
    const tenantA = await seedHospital();

    await expect(
      ownerPrisma.costCenter.create({
        data: {
          hospitalId: tenantA.hospital.id,
          code: "CC-HRD",
          name: "HRD",
          type: "indirect",
          profitCenterId: tenantA.profitCenter.id,
        },
      })
    ).rejects.toThrow();
  });

  it("persists a direct cost center with its profit_center_id set", async () => {
    const tenantA = await seedHospital();

    const costCenter = await ownerPrisma.costCenter.create({
      data: { hospitalId: tenantA.hospital.id, code: "CC-LAB", name: "Lab", type: "direct", profitCenterId: tenantA.profitCenter.id },
    });
    expect(costCenter.profitCenterId).toBe(tenantA.profitCenter.id);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
