import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PeriodService } from "../period/period.service";
import { StorageService } from "../storage/storage.service";
import { UploadService } from "./upload.service";
import { ParseService } from "./parse.service";
import { TEMPLATE_VERSION } from "./template-specs";
import type { UploadQueueService } from "../queue/upload-queue.service";
import type { VirusScanner } from "./virus-scanner";
import type { ConfigService } from "@nestjs/config";

const COST_HEADERS = ["period", "cost_center_code", "coa_account_code", "nominal"];

async function buildCostWorkbookBuffer(options: {
  versionMarker?: string;
  dataRows?: (string | number)[][];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  const versionRow = sheet.getRow(1);
  versionRow.getCell(1).value = options.versionMarker ?? `TEMPLATE_VERSION:${TEMPLATE_VERSION}`;
  versionRow.hidden = true;
  const headerRow = sheet.getRow(2);
  COST_HEADERS.forEach((header, index) => headerRow.getCell(index + 1).value = header);
  (options.dataRows ?? []).forEach((rowValues, rowIndex) => {
    const row = sheet.getRow(3 + rowIndex);
    rowValues.forEach((value, colIndex) => (row.getCell(colIndex + 1).value = value));
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Proves the parse job's RLS scoping against real Postgres —
 * `upload_rows_staging`/`validation_errors` have no `hospital_id` column of
 * their own (`EXISTS`-join RLS policy, `20260717171045_...` migration), the
 * kind of thing a unit test with a mocked Prisma client cannot verify — plus
 * a real file round-trip through MinIO. The BullMQ enqueue/dispatch hop
 * itself is already proven end-to-end by sub-task 2's integration suite;
 * this calls `ParseService.processUpload()` directly to focus on what's new
 * here (parse logic + the two new tables' RLS), not re-prove the queue.
 */
describe("Upload parse (RLS + real MinIO)", () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let minioContainer: StartedTestContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let storageService: StorageService;
  let periodService: PeriodService;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_parse_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${pgHost}:${pgPort}/hpp_parse_test?schema=public`;

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
  }, 120_000);

  afterAll(async () => {
    await ownerPrisma.$disconnect();
    await appPrisma.$disconnect();
    await pgContainer.stop();
    await minioContainer.stop();
  });

  function runAs<T>(orgId: string, hospitalId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

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
    const opened = await runAs(organization.id, hospital.id, () => periodService.open(hospital.id, period!.id, user.id));
    return { organization, hospital, user, period: opened };
  }

  async function createStagedBatch(
    tenant: Awaited<ReturnType<typeof seedHospitalWithOpenPeriod>>,
    fileBuffer: Buffer
  ) {
    const uploadQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService;
    const virusScanner: VirusScanner = { scan: async () => ({ clean: true }) };
    const uploadService = new UploadService(appPrisma as never, storageService, uploadQueueService, periodService, virusScanner);
    const file = {
      originalname: "cost-2026-01.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: fileBuffer.length,
      buffer: fileBuffer,
    } as Express.Multer.File;

    return runAs(tenant.organization.id, tenant.hospital.id, () =>
      uploadService.create(tenant.hospital.id, tenant.organization.id, "cost", { periodId: tenant.period.id }, file, tenant.user.id)
    );
  }

  function makeParseService() {
    const uploadQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService;
    return { parseService: new ParseService(appPrisma as never, storageService, uploadQueueService, tenantContextService), uploadQueueService };
  }

  it("parses a real uploaded file end-to-end: rows land in upload_rows_staging, scoped to the owning hospital under RLS", async () => {
    const tenant = await seedHospitalWithOpenPeriod();
    const fileBuffer = await buildCostWorkbookBuffer({
      dataRows: [
        ["2026-01", "CC-1", "COA-1", 1_000_000],
        ["2026-01", "CC-2", "COA-2", 2_000_000],
      ],
    });
    const created = await createStagedBatch(tenant, fileBuffer);
    const { parseService, uploadQueueService } = makeParseService();

    await parseService.processUpload({
      uploadBatchId: created.id,
      hospitalId: tenant.hospital.id,
      organizationId: tenant.organization.id,
      uploadedByUserId: tenant.user.id,
    });

    const batch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: created.id } });
    expect(batch.status).toBe("validating");
    expect(batch.rowCount).toBe(2);
    expect(uploadQueueService.enqueue).toHaveBeenCalledWith("upload.validate", expect.objectContaining({ uploadBatchId: created.id }));

    const rowsAsOwnHospital = await runAs(tenant.organization.id, tenant.hospital.id, () =>
      appPrisma.uploadRowStaging.findMany({ where: { uploadBatchId: created.id } })
    );
    expect(rowsAsOwnHospital).toHaveLength(2);

    const otherTenant = await seedHospitalWithOpenPeriod();
    const rowsAsOtherHospital = await runAs(otherTenant.organization.id, otherTenant.hospital.id, () =>
      appPrisma.uploadRowStaging.findMany({ where: { uploadBatchId: created.id } })
    );
    expect(rowsAsOtherHospital).toEqual([]);
  });

  it("fails the batch with an RLS-scoped E_TEMPLATE_VERSION validation_errors row for a stale template", async () => {
    const tenant = await seedHospitalWithOpenPeriod();
    const fileBuffer = await buildCostWorkbookBuffer({ versionMarker: "TEMPLATE_VERSION:v0", dataRows: [["2026-01", "CC-1", "COA-1", 1000]] });
    const created = await createStagedBatch(tenant, fileBuffer);
    const { parseService } = makeParseService();

    await parseService.processUpload({
      uploadBatchId: created.id,
      hospitalId: tenant.hospital.id,
      organizationId: tenant.organization.id,
      uploadedByUserId: tenant.user.id,
    });

    const batch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: created.id } });
    expect(batch.status).toBe("failed");
    expect(batch.errorCount).toBe(1);

    const errorsAsOwnHospital = await runAs(tenant.organization.id, tenant.hospital.id, () =>
      appPrisma.validationError.findMany({ where: { uploadBatchId: created.id } })
    );
    expect(errorsAsOwnHospital).toHaveLength(1);
    expect(errorsAsOwnHospital[0]).toMatchObject({ errorCode: "E_TEMPLATE_VERSION", severity: "error" });

    const otherTenant = await seedHospitalWithOpenPeriod();
    const errorsAsOtherHospital = await runAs(otherTenant.organization.id, otherTenant.hospital.id, () =>
      appPrisma.validationError.findMany({ where: { uploadBatchId: created.id } })
    );
    expect(errorsAsOtherHospital).toEqual([]);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
