import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { WhatIfSimulationService } from "./what-if-simulation.service";

/**
 * Proves `WhatIfSimulationService` against real Postgres data (RLS-scoped,
 * real Decimal columns) — the unit spec already proves the arithmetic
 * against mocked Prisma; this proves the same hand-calculated worked
 * example holds when reading actual `service_unit_costs`/
 * `profitability_results`/`revenue_entries` rows, and that simulating never
 * writes anything back (docs/12_AI_ENGINE.md §4 — "never writes to any
 * table").
 */
describe("WhatIfSimulationService (real Postgres)", () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let whatIfSimulationService: WhatIfSimulationService;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_what_if_test")
      .withUsername("hpp")
      .withPassword("hpp")
      .start();

    const ownerUrl = pgContainer.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, DATABASE_URL: ownerUrl },
      stdio: "inherit",
    });

    const pgHost = pgContainer.getHost();
    const pgPort = pgContainer.getMappedPort(5432);
    const appUrl = `postgresql://hpp_app:hpp_app@${pgHost}:${pgPort}/hpp_what_if_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    whatIfSimulationService = new WhatIfSimulationService(appPrisma as never);
  }, 120_000);

  afterAll(async () => {
    await ownerPrisma.$disconnect();
    await appPrisma.$disconnect();
    await pgContainer.stop();
  });

  function runAs<T>(orgId: string, hospitalId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

  it("recomputes service and profit-center figures from real allocation-run data, matching hand math, and writes nothing", async () => {
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
      data: { hospitalId: hospital.id, code: "PC-RJ", name: "Rawat Jalan" },
    });
    const service = await ownerPrisma.service.create({
      data: { hospitalId: hospital.id, profitCenterId: profitCenter.id, code: "SVC-1", name: "Konsultasi", serviceType: "consultation" },
    });
    const period = await ownerPrisma.period.create({
      data: { hospitalId: hospital.id, label: "2026-01", startDate: new Date("2026-01-01"), endDate: new Date("2026-02-01"), status: "open" },
    });
    const run = await ownerPrisma.allocationRun.create({
      data: { hospitalId: hospital.id, periodId: period.id, method: "direct", status: "completed", isStale: false, createdByUserId: user.id },
    });
    const uploadBatch = await ownerPrisma.uploadBatch.create({
      data: {
        hospitalId: hospital.id,
        periodId: period.id,
        type: "revenue",
        fileName: "seed.xlsx",
        fileUrl: "seed.xlsx",
        status: "confirmed",
        uploadedByUserId: user.id,
      },
    });

    // Real revenue for the service this period: 100 units * 50,000 = 5,000,000.
    await ownerPrisma.revenueEntry.create({
      data: {
        hospitalId: hospital.id,
        periodId: period.id,
        profitCenterId: profitCenter.id,
        serviceId: service.id,
        volume: "100",
        revenue: "5000000.00",
        sourceFileId: uploadBatch.id,
      },
    });

    // Baseline unit-cost snapshot from the allocation run: allocatedCost
    // 2,000,000 + directCost 1,000,000 over volume 100 -> unitCost 30,000.
    await ownerPrisma.serviceUnitCost.create({
      data: {
        allocationRunId: run.id,
        serviceId: service.id,
        serviceAllocatedCost: "2000000.00",
        serviceDirectCost: "1000000.00",
        serviceVolume: "100.00",
        unitCost: "30000.0000",
        currentTariff: "50000.00",
        tariffGap: "20000.0000",
        targetMarginUsed: "20.0000",
        recommendedTariff: "37500.0000",
      },
    });

    // Baseline profit-center result: revenue 20,000,000, directCost
    // 6,000,000, allocatedCost 4,000,000 -> grossProfit 10,000,000, margin 50%.
    await ownerPrisma.profitabilityResult.create({
      data: {
        allocationRunId: run.id,
        profitCenterId: profitCenter.id,
        revenue: "20000000.00",
        directCost: "6000000.00",
        allocatedCost: "4000000.00",
        totalCost: "10000000.00",
        grossProfit: "10000000.00",
        margin: "50.0000",
      },
    });

    const result = await runAs(organization.id, hospital.id, () =>
      whatIfSimulationService.simulate(hospital.id, { periodId: period.id, serviceId: service.id, hypotheticalTariff: 60_000, hypotheticalVolume: 150 })
    );

    // Same worked example as the unit spec: volumeRatio 1.5 -> directCost
    // scales to 1,500,000, allocatedCost stays fixed at 2,000,000.
    expect(result.serviceBaseline).toEqual({
      tariff: "50000.00",
      volume: "100.00",
      allocatedCost: "2000000.00",
      directCost: "1000000.00",
      totalCost: "3000000.00",
      unitCost: "30000.0000",
      tariffGap: "20000.0000",
      recommendedTariff: "37500.0000",
      revenue: "5000000.00",
    });
    expect(result.serviceHypothetical).toEqual({
      tariff: "60000.00",
      volume: "150.00",
      allocatedCost: "2000000.00",
      directCost: "1500000.00",
      totalCost: "3500000.00",
      unitCost: "23333.3333",
      tariffGap: "36666.6667",
      recommendedTariff: "29166.6667",
      revenue: "9000000.00",
    });
    expect(result.serviceDeltas).toEqual({
      revenue: { absolute: "4000000.00", percentage: "80.0000" },
      totalCost: { absolute: "500000.00", percentage: "16.6667" },
      unitCost: { absolute: "-6666.6667", percentage: "-22.2222" },
      tariffGap: { absolute: "16666.6667", percentage: "83.3333" },
    });
    expect(result.profitCenterHypothetical).toEqual({
      revenue: "24000000.00",
      directCost: "6000000.00",
      allocatedCost: "4000000.00",
      totalCost: "10000000.00",
      grossProfit: "14000000.00",
      margin: "58.3333",
    });
    expect(result.profitCenterDeltas).toEqual({
      revenue: { absolute: "4000000.00", percentage: "20.0000" },
      grossProfit: { absolute: "4000000.00", percentage: "40.0000" },
      margin: { absolute: "8.3333", percentage: "16.6667" },
    });

    // Ephemeral: the simulation must never write to any table.
    const [unitCostCount, profitabilityCount] = await Promise.all([
      ownerPrisma.serviceUnitCost.count({ where: { allocationRunId: run.id } }),
      ownerPrisma.profitabilityResult.count({ where: { allocationRunId: run.id } }),
    ]);
    expect(unitCostCount).toBe(1);
    expect(profitabilityCount).toBe(1);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
