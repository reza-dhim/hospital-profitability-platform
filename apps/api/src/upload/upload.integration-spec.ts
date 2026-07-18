import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { PrismaClient } from "@prisma/client";
import { UnprocessableEntityException } from "@nestjs/common";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "../period/period.service";
import { StorageService } from "../storage/storage.service";
import { UploadService } from "./upload.service";
import { TemplateService } from "./template.service";
import type { UploadQueueService } from "../queue/upload-queue.service";
import type { VirusScanner } from "./virus-scanner";
import type { ConfigService } from "@nestjs/config";

/**
 * Proves upload intake end-to-end against real backing services: Postgres
 * RLS for `upload_batches` (new table, same hospital-scoped shape as
 * `periods`) and real MinIO for the actual file write. The BullMQ enqueue
 * call itself is only asserted (mocked queue) — sub-task 2's own integration
 * suite already proves a real enqueue -> process cycle works; re-proving
 * that here would just duplicate it without covering anything new.
 */
describe("Upload intake (RLS + real MinIO)", () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let minioContainer: StartedTestContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let storageService: StorageService;
  let periodService: PeriodService;
  let templateService: TemplateService;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_upload_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${pgHost}:${pgPort}/hpp_upload_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    minioContainer = await new GenericContainer("minio/minio:latest")
      .withExposedPorts(9000)
      .withCommand(["server", "/data"])
      .withEnvironment({ MINIO_ROOT_USER: "hpp_minio_test", MINIO_ROOT_PASSWORD: "hpp_minio_test_secret" })
      .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000).forStatusCode(200))
      .start();

    const minioEndpoint = `http://${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}`;
    const storageConfig = {
      get: (key: string) => (key === "S3_ENDPOINT" ? minioEndpoint : key === "S3_REGION" ? "us-east-1" : undefined),
      getOrThrow: (key: string) => {
        const values: Record<string, string> = {
          S3_ACCESS_KEY_ID: "hpp_minio_test",
          S3_SECRET_ACCESS_KEY: "hpp_minio_test_secret",
          S3_BUCKET: "hpp-uploads-test",
        };
        const value = values[key];
        if (value === undefined) throw new Error(`Missing config: ${key}`);
        return value;
      },
    } as unknown as ConfigService;
    storageService = new StorageService(storageConfig);
    await storageService.onModuleInit();

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
    templateService = new TemplateService();
  }, 120_000);

  afterAll(async () => {
    await ownerPrisma.$disconnect();
    await appPrisma.$disconnect();
    await pgContainer.stop();
    await minioContainer.stop();
  });

  async function seedHospitalWithOpenPeriod() {
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
    const opened = await runAs(organization.id, hospital.id, () =>
      periodService.open(hospital.id, period!.id, user.id)
    );

    return { organization, hospital, user, period: opened };
  }

  function runAs<T>(orgId: string, hospitalId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

  function makeUploadService(virusScanner: VirusScanner) {
    const uploadQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService;
    const service = new UploadService(
      appPrisma as never,
      storageService,
      uploadQueueService,
      periodService,
      virusScanner
    );
    return { service, uploadQueueService };
  }

  async function makeUploadFile(): Promise<Express.Multer.File> {
    const buffer = await templateService.generate("cost");
    return {
      originalname: "cost-2026-01.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  }

  it("stores the file in MinIO under a tenant-prefixed key and writes an RLS-scoped, staged upload_batches row", async () => {
    const tenant = await seedHospitalWithOpenPeriod();
    const { service, uploadQueueService } = makeUploadService({ scan: async () => ({ clean: true }) });
    const file = await makeUploadFile();

    const created = await runAs(tenant.organization.id, tenant.hospital.id, () =>
      service.create(tenant.hospital.id, tenant.organization.id, "cost", { periodId: tenant.period.id }, file, tenant.user.id)
    );

    expect(created.status).toBe("staged");
    expect(uploadQueueService.enqueue).toHaveBeenCalledWith("upload.parse", {
      uploadBatchId: created.id,
      hospitalId: tenant.hospital.id,
      organizationId: tenant.organization.id,
      uploadedByUserId: tenant.user.id,
    });

    const row = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.hospitalId).toBe(tenant.hospital.id);
    expect(row.fileUrl).toBe(`${tenant.organization.id}/${tenant.hospital.id}/uploads/${created.id}.xlsx`);

    const signedUrl = await storageService.getSignedDownloadUrl(row.fileUrl);
    const response = await fetch(signedUrl);
    expect(response.status).toBe(200);
    const stored = Buffer.from(await response.arrayBuffer());
    expect(stored.equals(file.buffer)).toBe(true);
  });

  it("scopes upload_batches to its own hospital under RLS — a different org cannot see it", async () => {
    const tenantA = await seedHospitalWithOpenPeriod();
    const tenantB = await seedHospitalWithOpenPeriod();
    const { service } = makeUploadService({ scan: async () => ({ clean: true }) });
    const file = await makeUploadFile();

    const created = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      service.create(tenantA.hospital.id, tenantA.organization.id, "cost", { periodId: tenantA.period.id }, file, tenantA.user.id)
    );

    const rowsAsA = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.uploadBatch.findMany({ where: { id: created.id } })
    );
    expect(rowsAsA).toHaveLength(1);

    const rowsAsB = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.uploadBatch.findMany({ where: { id: created.id } })
    );
    expect(rowsAsB).toEqual([]);
  });

  it("rejects an upload targeting a non-open period and creates no row", async () => {
    const tenant = await seedHospitalWithOpenPeriod();
    // Generate a second fiscal year's periods — left in `draft`, never opened.
    const [draftPeriod] = await runAs(tenant.organization.id, tenant.hospital.id, () =>
      periodService.generate(tenant.hospital.id, { fiscalYear: 2027 }, tenant.user.id)
    );
    const { service } = makeUploadService({ scan: async () => ({ clean: true }) });
    const file = await makeUploadFile();

    await expect(
      runAs(tenant.organization.id, tenant.hospital.id, () =>
        service.create(tenant.hospital.id, tenant.organization.id, "cost", { periodId: draftPeriod!.id }, file, tenant.user.id)
      )
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const countAsTenant = await runAs(tenant.organization.id, tenant.hospital.id, () =>
      appPrisma.uploadBatch.count({ where: { periodId: draftPeriod!.id } })
    );
    expect(countAsTenant).toBe(0);
  });

  it("creates a failed row for an infected file and never writes it to storage", async () => {
    const tenant = await seedHospitalWithOpenPeriod();
    const { service } = makeUploadService({ scan: async () => ({ clean: false }) });
    const file = await makeUploadFile();

    const created = await runAs(tenant.organization.id, tenant.hospital.id, () =>
      service.create(tenant.hospital.id, tenant.organization.id, "cost", { periodId: tenant.period.id }, file, tenant.user.id)
    );

    expect(created.status).toBe("failed");
    const row = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: created.id } });

    const response = await fetch(await storageService.getSignedDownloadUrl(row.fileUrl));
    expect(response.status).not.toBe(200);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
