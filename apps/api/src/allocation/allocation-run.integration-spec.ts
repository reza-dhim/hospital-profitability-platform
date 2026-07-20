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
import { AllocationRunService } from "./allocation-run.service";
import type { AllocationQueueService } from "../queue/allocation-queue.service";

/**
 * Sprint 5 sub-task 1: proves the `allocation_runs` (plain hospital-scoped)
 * and `allocated_costs` (EXISTS-join against allocation_runs, no
 * hospital_id of its own) RLS policies added in
 * `prisma/migrations/20260718132748_add_allocation_runs`, plus the
 * `allocated_costs_exactly_one_target_check` CHECK constraint — same shape
 * proof as `driver_values`'s equivalent, one level further down the FK
 * chain since `allocated_costs` has no tenant column of its own.
 */
describe("Allocation run persistence (RLS)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let periodService: PeriodService;
  let allocationRunService: AllocationRunService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_allocation_run_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_allocation_run_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
    // BullMQ orchestration is covered by allocation-engine.integration-spec.ts —
    // this spec is about the persistence shape and RLS, so the queue is mocked.
    const allocationQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as AllocationQueueService;
    allocationRunService = new AllocationRunService(appPrisma as never, new AuditContextService(), allocationQueueService);
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
    const sourceCostCenter = await ownerPrisma.costCenter.create({
      data: { hospitalId: hospital.id, code: "LAUNDRY", name: "Laundry", type: "indirect" },
    });
    const targetCostCenter = await ownerPrisma.costCenter.create({
      data: { hospitalId: hospital.id, code: "IT", name: "IT Department", type: "indirect" },
    });
    const targetProfitCenter = await ownerPrisma.profitCenter.create({
      data: { hospitalId: hospital.id, code: "RJ", name: "Rawat Jalan" },
    });
    const driver = await ownerPrisma.driver.create({
      data: { hospitalId: hospital.id, code: "KG-LAUNDRY", name: "Kg Laundry", unit: "kg" },
    });
    const [period] = await runAs(organization.id, hospital.id, () =>
      periodService.generate(hospital.id, { fiscalYear: 2026 }, user.id)
    );
    return { organization, hospital, user, sourceCostCenter, targetCostCenter, targetProfitCenter, driver, period: period! };
  }

  it("create() persists a draft allocation run, readable only by its own hospital under RLS", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const run = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      allocationRunService.create(
        tenantA.hospital.id,
        tenantA.organization.id,
        { periodId: tenantA.period.id, method: "step_down" },
        tenantA.user.id
      )
    );
    expect(run.status).toBe("draft");
    expect(run.method).toBe("step_down");

    const readAsA = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      allocationRunService.findOne(tenantA.hospital.id, run.id)
    );
    expect(readAsA.id).toBe(run.id);

    await expect(
      runAs(tenantB.organization.id, tenantB.hospital.id, () => allocationRunService.findOne(tenantB.hospital.id, run.id))
    ).rejects.toThrow(NotFoundException);

    const listedAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      allocationRunService.findAll(tenantB.hospital.id, { page: 1, limit: 20 })
    );
    expect(listedAsB.data).toEqual([]);
  });

  it("rejects creating a run against a period that belongs to a different hospital", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    await expect(
      runAs(tenantB.organization.id, tenantB.hospital.id, () =>
        allocationRunService.create(
          tenantB.hospital.id,
          tenantB.organization.id,
          { periodId: tenantA.period.id, method: "direct" },
          tenantB.user.id
        )
      )
    ).rejects.toThrow(NotFoundException);
  });

  it("scopes allocated_costs via the EXISTS-join against allocation_runs.hospital_id, with no hospital_id of its own", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const run = await ownerPrisma.allocationRun.create({
      data: {
        hospitalId: tenantA.hospital.id,
        periodId: tenantA.period.id,
        method: "direct",
        status: "draft",
        createdByUserId: tenantA.user.id,
      },
    });
    const allocatedCost = await ownerPrisma.allocatedCost.create({
      data: {
        allocationRunId: run.id,
        sourceCostCenterId: tenantA.sourceCostCenter.id,
        targetProfitCenterId: tenantA.targetProfitCenter.id,
        driverId: tenantA.driver.id,
        amount: "7000000.00",
      },
    });

    const rowsAsA = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.allocatedCost.findMany({ where: { allocationRunId: run.id } })
    );
    expect(rowsAsA).toHaveLength(1);
    expect(rowsAsA[0]!.id).toBe(allocatedCost.id);

    const rowsAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.allocatedCost.findMany({ where: { allocationRunId: run.id } })
    );
    expect(rowsAsB).toEqual([]);
  });

  it("rejects an allocated_costs row with both targets set, or neither, via the exactly-one-target CHECK constraint", async () => {
    const tenantA = await seedHospital();
    const run = await ownerPrisma.allocationRun.create({
      data: {
        hospitalId: tenantA.hospital.id,
        periodId: tenantA.period.id,
        method: "direct",
        status: "draft",
        createdByUserId: tenantA.user.id,
      },
    });

    await expect(
      ownerPrisma.allocatedCost.create({
        data: {
          allocationRunId: run.id,
          sourceCostCenterId: tenantA.sourceCostCenter.id,
          targetCostCenterId: tenantA.targetCostCenter.id,
          targetProfitCenterId: tenantA.targetProfitCenter.id,
          driverId: tenantA.driver.id,
          amount: "1000.00",
        },
      })
    ).rejects.toThrow();

    await expect(
      ownerPrisma.allocatedCost.create({
        data: {
          allocationRunId: run.id,
          sourceCostCenterId: tenantA.sourceCostCenter.id,
          driverId: tenantA.driver.id,
          amount: "1000.00",
        },
      })
    ).rejects.toThrow();
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
