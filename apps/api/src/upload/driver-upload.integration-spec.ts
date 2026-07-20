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
import { ValidateService } from "./validate.service";
import { ConfirmService } from "./confirm.service";
import { TEMPLATE_VERSION } from "./template-specs";
import type { UploadQueueService } from "../queue/upload-queue.service";
import type { VirusScanner } from "./virus-scanner";
import type { ConfigService } from "@nestjs/config";

const DRIVER_HEADERS = ["period", "driver_code", "target_type", "target_code", "value"];

async function buildDriverWorkbookBuffer(dataRows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  const versionRow = sheet.getRow(1);
  versionRow.getCell(1).value = `TEMPLATE_VERSION:${TEMPLATE_VERSION}`;
  versionRow.hidden = true;
  const headerRow = sheet.getRow(2);
  DRIVER_HEADERS.forEach((header, index) => (headerRow.getCell(index + 1).value = header));
  dataRows.forEach((rowValues, rowIndex) => {
    const row = sheet.getRow(3 + rowIndex);
    rowValues.forEach((value, colIndex) => (row.getCell(colIndex + 1).value = value));
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Proves the Sprint 5 sub-task 0 driver-value intake pipeline end-to-end:
 * a real `.xlsx` upload, through the *real* parse/validate/confirm chain
 * (reusing every Sprint 4 service unmodified in shape, just now handling
 * `type: "driver"`), landing as RLS-scoped `DriverValue` rows with the
 * correct polymorphic target resolved — a cost-center target and a
 * profit-center target in the same file, since that's exactly the
 * step-down-flow case the two-nullable-FK schema decision exists for.
 */
describe("Driver value upload pipeline (RLS + real MinIO)", () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let minioContainer: StartedTestContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let storageService: StorageService;
  let periodService: PeriodService;
  let uploadService: UploadService;
  let parseService: ParseService;
  let validateService: ValidateService;
  let confirmService: ConfirmService;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_driver_upload_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${pgHost}:${pgPort}/hpp_driver_upload_test?schema=public`;

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
          S3_BUCKET: "hpp-driver-uploads-test",
        };
        const value = values[key];
        if (value === undefined) throw new Error(`Missing config: ${key}`);
        return value;
      },
    } as unknown as ConfigService;
    storageService = new StorageService(storageConfig);
    await storageService.onModuleInit();

    periodService = new PeriodService(appPrisma as never, new AuditContextService());
    const auditContextService = new AuditContextService();
    parseService = new ParseService(
      appPrisma as never,
      storageService,
      { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService,
      tenantContextService
    );
    validateService = new ValidateService(appPrisma as never, tenantContextService);
    confirmService = new ConfirmService(appPrisma as never, tenantContextService, auditContextService);
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
    const driver = await ownerPrisma.driver.create({
      data: { hospitalId: hospital.id, code: "EMP-COUNT", name: "Employee Count", unit: "people" },
    });
    const costCenter = await ownerPrisma.costCenter.create({
      data: { hospitalId: hospital.id, code: "IT", name: "IT Department", type: "indirect" },
    });
    const profitCenter = await ownerPrisma.profitCenter.create({
      data: { hospitalId: hospital.id, code: "RJ", name: "Rawat Jalan" },
    });
    const [period] = await runAs(organization.id, hospital.id, () =>
      periodService.generate(hospital.id, { fiscalYear: 2026 }, user.id)
    );
    const opened = await runAs(organization.id, hospital.id, () => periodService.open(hospital.id, period!.id, user.id));
    return { organization, hospital, user, driver, costCenter, profitCenter, period: opened };
  }

  it("runs a driver-value file through the real intake -> parse -> validate -> confirm chain, RLS-scoped, with both target types resolved", async () => {
    const tenantA = await seedHospital();
    const tenantB = await seedHospital();

    const buffer = await buildDriverWorkbookBuffer([
      ["2026-01", "EMP-COUNT", "cost_center", "IT", 5],
      ["2026-01", "EMP-COUNT", "profit_center", "RJ", 12],
    ]);
    const file = {
      originalname: "driver-2026-01.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const uploadQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService;
    const virusScanner: VirusScanner = { scan: async () => ({ clean: true }) };
    uploadService = new UploadService(appPrisma as never, storageService, uploadQueueService, periodService, virusScanner);

    const created = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      uploadService.create(tenantA.hospital.id, tenantA.organization.id, "driver", { periodId: tenantA.period.id }, file, tenantA.user.id)
    );
    expect(created.status).toBe("staged");

    const jobPayload = {
      uploadBatchId: created.id,
      hospitalId: tenantA.hospital.id,
      organizationId: tenantA.organization.id,
      uploadedByUserId: tenantA.user.id,
    };
    await parseService.processUpload(jobPayload);

    const parsedBatch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: created.id } });
    expect(parsedBatch.status).toBe("validating");
    expect(parsedBatch.rowCount).toBe(2);

    await validateService.processValidate(jobPayload);
    const validatedBatch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: created.id } });
    expect(validatedBatch.status).toBe("validated");

    const confirmed = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      confirmService.confirm(tenantA.hospital.id, created.id, {}, tenantA.user.id)
    );
    expect(confirmed.status).toBe("confirmed");

    const driverValues = await ownerPrisma.driverValue.findMany({
      where: { sourceFileId: created.id },
      orderBy: { value: "asc" },
    });
    expect(driverValues).toHaveLength(2);
    expect(driverValues[0]).toMatchObject({
      hospitalId: tenantA.hospital.id,
      driverId: tenantA.driver.id,
      targetCostCenterId: tenantA.costCenter.id,
      targetProfitCenterId: null,
    });
    expect(driverValues[0]!.value.toNumber()).toBe(5);
    expect(driverValues[1]).toMatchObject({
      hospitalId: tenantA.hospital.id,
      driverId: tenantA.driver.id,
      targetCostCenterId: null,
      targetProfitCenterId: tenantA.profitCenter.id,
    });
    expect(driverValues[1]!.value.toNumber()).toBe(12);

    const rowsAsOwnHospital = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.driverValue.findMany({ where: { sourceFileId: created.id } })
    );
    expect(rowsAsOwnHospital).toHaveLength(2);

    const rowsAsOtherHospital = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.driverValue.findMany({ where: { sourceFileId: created.id } })
    );
    expect(rowsAsOtherHospital).toEqual([]);
  });

  it("fails validation with E_INVALID_COST_CENTER for a target_code that doesn't exist under the given target_type, and confirms nothing", async () => {
    const tenant = await seedHospital();
    const buffer = await buildDriverWorkbookBuffer([["2026-01", "EMP-COUNT", "cost_center", "NOPE", 5]]);
    const file = {
      originalname: "driver-bad.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const uploadQueueService = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as UploadQueueService;
    const virusScanner: VirusScanner = { scan: async () => ({ clean: true }) };
    uploadService = new UploadService(appPrisma as never, storageService, uploadQueueService, periodService, virusScanner);

    const created = await runAs(tenant.organization.id, tenant.hospital.id, () =>
      uploadService.create(tenant.hospital.id, tenant.organization.id, "driver", { periodId: tenant.period.id }, file, tenant.user.id)
    );
    const jobPayload = {
      uploadBatchId: created.id,
      hospitalId: tenant.hospital.id,
      organizationId: tenant.organization.id,
      uploadedByUserId: tenant.user.id,
    };
    await parseService.processUpload(jobPayload);
    await validateService.processValidate(jobPayload);

    const batch = await ownerPrisma.uploadBatch.findUniqueOrThrow({ where: { id: created.id } });
    expect(batch.status).toBe("failed");
    const errors = await ownerPrisma.validationError.findMany({ where: { uploadBatchId: created.id } });
    expect(errors).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_COST_CENTER", columnName: "target_code" }));

    const driverValues = await ownerPrisma.driverValue.findMany({ where: { sourceFileId: created.id } });
    expect(driverValues).toEqual([]);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
