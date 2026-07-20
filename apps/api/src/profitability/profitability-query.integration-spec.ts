import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { ProfitabilityQueryService } from "./profitability-query.service";

/**
 * Sprint 6 sub-task 3: proves the read API queries the materialized
 * `profitability_results`/`service_unit_costs` tables correctly and stays
 * RLS-scoped to its own hospital even when called under another tenant's
 * session — the query-layer counterpart to the write-side RLS proofs
 * already covering these tables' migrations.
 */
describe("Profitability read API (RLS)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let profitabilityQueryService: ProfitabilityQueryService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_profitability_query_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_profitability_query_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    profitabilityQueryService = new ProfitabilityQueryService(appPrisma as never);
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

  async function seedCompletedRun() {
    const organization = await ownerPrisma.organization.create({ data: { name: `Org ${randomUUID()}` } });
    const hospital = await ownerPrisma.hospital.create({
      data: { organizationId: organization.id, name: `Hospital ${randomUUID()}`, code: randomUUID().slice(0, 8) },
    });
    const otherHospital = await ownerPrisma.hospital.create({
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
    const service = await ownerPrisma.service.create({
      data: { hospitalId: hospital.id, profitCenterId: profitCenter.id, code: "SVC-1", name: "Konsultasi", serviceType: "consultation" },
    });
    const period = await ownerPrisma.period.create({
      data: {
        hospitalId: hospital.id,
        label: `2026-${randomUUID().slice(0, 2)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-02-01"),
        status: "open",
      },
    });
    const run = await ownerPrisma.allocationRun.create({
      data: { hospitalId: hospital.id, periodId: period.id, method: "direct", status: "completed", createdByUserId: user.id },
    });
    await ownerPrisma.profitabilityResult.create({
      data: {
        allocationRunId: run.id,
        profitCenterId: profitCenter.id,
        revenue: "22500000.00",
        directCost: "0.00",
        allocatedCost: "14100000.00",
        totalCost: "14100000.00",
        grossProfit: "8400000.00",
        margin: "37.3333",
      },
    });
    await ownerPrisma.serviceUnitCost.create({
      data: {
        allocationRunId: run.id,
        serviceId: service.id,
        serviceAllocatedCost: "14100000.00",
        serviceDirectCost: "0.00",
        serviceVolume: "100.00",
        unitCost: "141000.0000",
        currentTariff: "150000.00",
        tariffGap: "9000.0000",
        targetMarginUsed: "15.0000",
        recommendedTariff: "165882.3529",
      },
    });

    return { organization, hospital, otherHospital, user, profitCenter, service, period, run };
  }

  /**
   * Extends `seedCompletedRun()` with an earlier ("trailing") period for the
   * same hospital/profit_center/service, its own completed run, and its own
   * profitability_results/service_unit_costs rows — for proving variance
   * end-to-end against real Postgres.
   */
  async function seedCompletedRunWithTrailingPeriod() {
    const t = await seedCompletedRun();

    const trailingPeriod = await ownerPrisma.period.create({
      data: {
        hospitalId: t.hospital.id,
        label: `2025-${randomUUID().slice(0, 2)}`,
        startDate: new Date("2025-12-01"),
        endDate: new Date("2026-01-01"),
        status: "closed",
      },
    });
    const trailingRun = await ownerPrisma.allocationRun.create({
      data: { hospitalId: t.hospital.id, periodId: trailingPeriod.id, method: "direct", status: "completed", createdByUserId: t.user.id },
    });
    await ownerPrisma.profitabilityResult.create({
      data: {
        allocationRunId: trailingRun.id,
        profitCenterId: t.profitCenter.id,
        revenue: "20000000.00",
        directCost: "0.00",
        allocatedCost: "12000000.00",
        totalCost: "12000000.00",
        grossProfit: "8000000.00",
        margin: "40.0000",
      },
    });
    await ownerPrisma.serviceUnitCost.create({
      data: {
        allocationRunId: trailingRun.id,
        serviceId: t.service.id,
        serviceAllocatedCost: "12000000.00",
        serviceDirectCost: "0.00",
        serviceVolume: "100.00",
        unitCost: "120000.0000",
        currentTariff: "150000.00",
        tariffGap: "30000.0000",
        targetMarginUsed: "15.0000",
        recommendedTariff: "141176.4706",
      },
    });

    return { ...t, trailingPeriod, trailingRun };
  }

  it("summary/profitCenters/services return the seeded data for the owning hospital", async () => {
    const t = await seedCompletedRun();

    const summary = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.summary(t.hospital.id, { periodId: t.period.id })
    );
    expect(summary.allocationRunId).toBe(t.run.id);
    expect(summary.totalRevenue).toBe("22500000.00");
    expect(summary.overallMargin).toBe("37.3333");

    const profitCenters = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.profitCenters(t.hospital.id, { periodId: t.period.id })
    );
    expect(profitCenters.data).toHaveLength(1);
    expect(profitCenters.data[0]).toMatchObject({ profitCenterId: t.profitCenter.id, profitCenterCode: "RJ" });

    const services = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.services(t.hospital.id, { periodId: t.period.id })
    );
    expect(services.data).toHaveLength(1);
    expect(services.data[0]).toMatchObject({ serviceId: t.service.id, serviceCode: "SVC-1", unitCost: "141000.0000" });
  });

  /**
   * MANUAL CALCULATION: current period total_cost 14,100,000 vs. trailing
   * period total_cost 12,000,000.
   *   absolute   = 14,100,000 − 12,000,000 = 2,100,000
   *   percentage = 2,100,000 / 12,000,000 × 100 = 17.5%
   * current unit_cost 141,000 vs. trailing unit_cost 120,000.
   *   absolute   = 141,000 − 120,000 = 21,000
   *   percentage = 21,000 / 120,000 × 100 = 17.5%
   * Hospital-wide summary (single profit center, so summary = that row):
   * current revenue 22,500,000 / totalCost 14,100,000 / grossProfit
   * 8,400,000 (margin 37.3333...%) vs. trailing revenue 20,000,000 /
   * totalCost 12,000,000 / grossProfit 8,000,000 (margin 40%).
   *   totalRevenueVariance:     abs = 22,500,000−20,000,000 = 2,500,000
   *                             pct = 2,500,000/20,000,000×100 = 12.5%
   *   totalGrossProfitVariance: abs = 8,400,000−8,000,000 = 400,000
   *                             pct = 400,000/8,000,000×100 = 5%
   *   overallMarginVariance:    abs = 37.3333...−40 = −2.6666...% ≈ −2.6667%
   *                             pct = −2.6666.../40×100 = −6.6666...% ≈ −6.6667%
   */
  it("computes totalCostVariance/unitCostVariance/summary variance against a real trailing period's completed run", async () => {
    const t = await seedCompletedRunWithTrailingPeriod();

    const summary = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.summary(t.hospital.id, { periodId: t.period.id })
    );
    expect(summary.totalRevenueVariance).toEqual({ absolute: "2500000.00", percentage: "12.5000" });
    expect(summary.totalCostVariance).toEqual({ absolute: "2100000.00", percentage: "17.5000" });
    expect(summary.totalGrossProfitVariance).toEqual({ absolute: "400000.00", percentage: "5.0000" });
    expect(summary.overallMarginVariance).toEqual({ absolute: "-2.6667", percentage: "-6.6667" });

    const profitCenters = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.profitCenters(t.hospital.id, { periodId: t.period.id })
    );
    expect(profitCenters.data[0]!.totalCostVariance).toEqual({ absolute: "2100000.00", percentage: "17.5000" });

    const services = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.services(t.hospital.id, { periodId: t.period.id })
    );
    expect(services.data[0]!.unitCostVariance).toEqual({ absolute: "21000.0000", percentage: "17.5000" });

    // The trailing period's own run has no earlier period to compare against — variance is null there.
    const trailingProfitCenters = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.profitCenters(t.hospital.id, { periodId: t.trailingPeriod.id })
    );
    expect(trailingProfitCenters.data[0]!.totalCostVariance).toBeNull();
  });

  it("stays RLS-scoped: reading under a different hospital's session sees nothing, even with the correct id passed explicitly", async () => {
    const t = await seedCompletedRun();

    await expect(
      runAs(t.organization.id, t.otherHospital.id, () => profitabilityQueryService.summary(t.hospital.id, { periodId: t.period.id }))
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      runAs(t.organization.id, t.otherHospital.id, () =>
        profitabilityQueryService.profitCenters(t.hospital.id, { periodId: t.period.id, allocationRunId: t.run.id })
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("trends returns one point for the seeded period and omits everything else", async () => {
    const t = await seedCompletedRun();

    const trend = await runAs(t.organization.id, t.hospital.id, () =>
      profitabilityQueryService.trends(t.hospital.id, t.profitCenter.id)
    );

    expect(trend.data).toHaveLength(1);
    expect(trend.data[0]).toMatchObject({ periodId: t.period.id, revenue: "22500000.00", margin: "37.3333" });
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
