import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "../period/period.service";
import { AllocationRunService } from "./allocation-run.service";
import { AllocationEngineService } from "./allocation-engine.service";
import { AllocationEngineProcessor } from "./allocation-engine.processor";
import { AllocationQueueService } from "../queue/allocation-queue.service";
import { ALLOCATION_QUEUE_NAME } from "../queue/queue.constants";

/**
 * Sprint 5 sub-task 4: proves the full wiring end-to-end against real
 * Postgres + real Redis — `POST /allocation-runs`-equivalent
 * (`AllocationRunService.create`) enqueues a real BullMQ job, a real
 * `AllocationEngineProcessor`/`AllocationEngineService` worker picks it up,
 * runs the actual Step-Down algorithm (`@hpp/domain`) against real
 * `cost_entries`/`allocation_rules`/`driver_values` rows, and persists
 * `allocated_costs` that match docs/08_COST_ALLOCATION_ENGINE.md §4's
 * worked example exactly — the same numbers already hand-verified in
 * `packages/domain`'s and `allocation-engine.service.spec.ts`'s unit tests,
 * now proven through the real queue + real database + RLS.
 */
describe("Allocation engine end-to-end (real Postgres + real Redis)", () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let periodService: PeriodService;
  let allocationRunService: AllocationRunService;
  let worker: Worker;
  let connections: IORedis[];

  function connect(): IORedis {
    const connection = new IORedis(redisContainer.getConnectionUrl(), { maxRetriesPerRequest: null });
    connections.push(connection);
    return connection;
  }

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_allocation_engine_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${pgHost}:${pgPort}/hpp_allocation_engine_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    redisContainer = await new RedisContainer("redis:7-alpine").start();
    connections = [];
    const queue = new Queue(ALLOCATION_QUEUE_NAME, { connection: connect() });
    const allocationQueueService = new AllocationQueueService(queue as never);

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
    allocationRunService = new AllocationRunService(appPrisma as never, new AuditContextService(), allocationQueueService);

    const allocationEngineService = new AllocationEngineService(appPrisma as never, tenantContextService);
    const processor = new AllocationEngineProcessor(allocationEngineService);
    worker = new Worker(ALLOCATION_QUEUE_NAME, (job) => processor.process(job), { connection: connect() });
  }, 120_000);

  afterAll(async () => {
    await worker.close();
    await ownerPrisma.$disconnect();
    await appPrisma.$disconnect();
    await Promise.all(connections.map((c) => c.quit()));
    await pgContainer.stop();
    await redisContainer.stop();
  });

  function runAs<T>(orgId: string, hospitalId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

  function waitFor(predicate: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const poll = async () => {
        if (await predicate()) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error("Timed out waiting for condition"));
        setTimeout(poll, 100);
      };
      void poll();
    });
  }

  it(
    "create() enqueues a real job that a real worker runs to completion, producing allocated_costs matching " +
      "the docs §4 HRD/IT worked example exactly (RJ=82,000,000, RI=68,000,000), RLS-scoped to its own hospital",
    async () => {
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

      const hrd = await ownerPrisma.costCenter.create({ data: { hospitalId: hospital.id, code: "HRD", name: "HRD", type: "support" } });
      const it = await ownerPrisma.costCenter.create({ data: { hospitalId: hospital.id, code: "IT", name: "IT", type: "support" } });
      const rj = await ownerPrisma.profitCenter.create({ data: { hospitalId: hospital.id, code: "RJ", name: "Rawat Jalan" } });
      const ri = await ownerPrisma.profitCenter.create({ data: { hospitalId: hospital.id, code: "RI", name: "Rawat Inap" } });
      const empCount = await ownerPrisma.driver.create({ data: { hospitalId: hospital.id, code: "EMP", name: "Employee Count", unit: "people" } });
      const deviceCount = await ownerPrisma.driver.create({ data: { hospitalId: hospital.id, code: "DEV", name: "Device Count", unit: "devices" } });

      const [period] = await runAs(organization.id, hospital.id, () =>
        periodService.generate(hospital.id, { fiscalYear: 2026 }, user.id)
      );
      const opened = await runAs(organization.id, hospital.id, () => periodService.open(hospital.id, period!.id, user.id));

      const coaAccount = await ownerPrisma.coaAccount.create({
        data: { hospitalId: hospital.id, code: "COA-1", name: "Expense", category: "expense" },
      });
      const uploadBatch = await ownerPrisma.uploadBatch.create({
        data: {
          hospitalId: hospital.id,
          periodId: opened.id,
          type: "cost",
          fileName: "seed.xlsx",
          fileUrl: "seed.xlsx",
          status: "confirmed",
          uploadedByUserId: user.id,
        },
      });
      await ownerPrisma.costEntry.createMany({
        data: [
          { hospitalId: hospital.id, periodId: opened.id, costCenterId: hrd.id, coaAccountId: coaAccount.id, nominal: "100000000.00", sourceFileId: uploadBatch.id },
          { hospitalId: hospital.id, periodId: opened.id, costCenterId: it.id, coaAccountId: coaAccount.id, nominal: "50000000.00", sourceFileId: uploadBatch.id },
        ],
      });
      await ownerPrisma.driverValue.createMany({
        data: [
          { hospitalId: hospital.id, periodId: opened.id, driverId: empCount.id, targetProfitCenterId: rj.id, value: "40", sourceFileId: uploadBatch.id },
          { hospitalId: hospital.id, periodId: opened.id, driverId: empCount.id, targetProfitCenterId: ri.id, value: "40", sourceFileId: uploadBatch.id },
          { hospitalId: hospital.id, periodId: opened.id, driverId: empCount.id, targetCostCenterId: it.id, value: "20", sourceFileId: uploadBatch.id },
          { hospitalId: hospital.id, periodId: opened.id, driverId: deviceCount.id, targetProfitCenterId: rj.id, value: "60", sourceFileId: uploadBatch.id },
          { hospitalId: hospital.id, periodId: opened.id, driverId: deviceCount.id, targetProfitCenterId: ri.id, value: "40", sourceFileId: uploadBatch.id },
        ],
      });
      await ownerPrisma.allocationRule.createMany({
        data: [
          { hospitalId: hospital.id, costCenterId: hrd.id, driverId: empCount.id, method: "step_down", priority: 1, effectivePeriod: opened.label },
          { hospitalId: hospital.id, costCenterId: it.id, driverId: deviceCount.id, method: "step_down", priority: 2, effectivePeriod: opened.label },
        ],
      });

      const run = await runAs(organization.id, hospital.id, () =>
        allocationRunService.create(hospital.id, organization.id, { periodId: opened.id, method: "step_down" }, user.id)
      );
      expect(run.status).toBe("draft");

      await waitFor(async () => {
        const current = await ownerPrisma.allocationRun.findUniqueOrThrow({ where: { id: run.id } });
        return current.status === "completed" || current.status === "failed";
      });

      const completed = await ownerPrisma.allocationRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(completed.status).toBe("completed");
      expect(completed.errorMessage).toBeNull();
      expect(completed.warnings).toBeNull();

      const allocatedCosts = await ownerPrisma.allocatedCost.findMany({ where: { allocationRunId: run.id } });
      const totalByProfitCenter = new Map<string, number>();
      for (const row of allocatedCosts) {
        if (!row.targetProfitCenterId) continue;
        totalByProfitCenter.set(row.targetProfitCenterId, (totalByProfitCenter.get(row.targetProfitCenterId) ?? 0) + row.amount.toNumber());
      }
      expect(totalByProfitCenter.get(rj.id)).toBe(82_000_000);
      expect(totalByProfitCenter.get(ri.id)).toBe(68_000_000);

      // IT never allocates back to HRD.
      expect(allocatedCosts.some((row) => row.sourceCostCenterId === it.id && row.targetCostCenterId === hrd.id)).toBe(false);

      const asOwnHospital = await runAs(organization.id, hospital.id, () =>
        appPrisma.allocatedCost.findMany({ where: { allocationRunId: run.id } })
      );
      expect(asOwnHospital).toHaveLength(allocatedCosts.length);

      const asOtherHospital = await runAs(organization.id, otherHospital.id, () =>
        appPrisma.allocatedCost.findMany({ where: { allocationRunId: run.id } })
      );
      expect(asOtherHospital).toEqual([]);
    }
  );
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
