import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import type { ConfigService } from "@nestjs/config";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PermissionsService } from "../auth/permissions.service";
import { StorageService } from "../storage/storage.service";
import { ProfitabilityQueryService } from "../profitability/profitability-query.service";
import { DoctorAnalyticsService } from "../doctor-analytics/doctor-analytics.service";
import { ReportDataService } from "./report-data.service";
import { ReportRendererService } from "./report-renderer.service";
import { ReportExportService } from "./report-export.service";

/**
 * Proves the Reports pipeline (docs/15_REPORTING.md) against real Postgres
 * + real MinIO: a real xlsx round-trips through exceljs's own parser with
 * the expected sheets/values, real `StorageService` put/get, and
 * `report_exports` versioning (`regenerate` true/false) behaves correctly
 * — all exercised through `ReportExportService.profitabilityDetailExcel()`,
 * which shares its storage/versioning code (`getOrGenerate()`) with every
 * other report type. `ReportDataService`'s data assembly (the same data
 * `ReportRendererService` turns into a PDF) is proven directly for both
 * Executive Summary and Doctor Analytics, including the identified-vs-
 * de-identified masking for a role without `doctor_analytics.read_detail`
 * — same real-RBAC-rows standard as `doctor-analytics.integration-spec.ts`.
 * PDF rendering itself (Puppeteer) is not exercised here — see the inline
 * comment at that point in the test for why, and how it was verified
 * instead.
 */
describe("Reporting pipeline (real Postgres + real MinIO)", () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let minioContainer: StartedTestContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let reportExportService: ReportExportService;
  let reportDataService: ReportDataService;
  const bucket = "hpp-reports-test";

  beforeAll(async () => {
    [pgContainer, minioContainer] = await Promise.all([
      new PostgreSqlContainer("postgres:16-alpine").withDatabase("hpp_reports_test").withUsername("hpp").withPassword("hpp").start(),
      new GenericContainer("minio/minio:latest")
        .withExposedPorts(9000)
        .withCommand(["server", "/data"])
        .withEnvironment({ MINIO_ROOT_USER: "hpp_minio_test", MINIO_ROOT_PASSWORD: "hpp_minio_test_secret" })
        .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000).forStatusCode(200))
        .start(),
    ]);

    const ownerUrl = pgContainer.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, DATABASE_URL: ownerUrl },
      stdio: "inherit",
    });

    const pgHost = pgContainer.getHost();
    const pgPort = pgContainer.getMappedPort(5432);
    const appUrl = `postgresql://hpp_app:hpp_app@${pgHost}:${pgPort}/hpp_reports_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    const minioEndpoint = `http://${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}`;
    const config = {
      get: (key: string) => (key === "S3_ENDPOINT" ? minioEndpoint : key === "S3_REGION" ? "us-east-1" : undefined),
      getOrThrow: (key: string) => {
        const values: Record<string, string> = {
          S3_ACCESS_KEY_ID: "hpp_minio_test",
          S3_SECRET_ACCESS_KEY: "hpp_minio_test_secret",
          S3_BUCKET: bucket,
        };
        const value = values[key];
        if (value === undefined) throw new Error(`Missing config: ${key}`);
        return value;
      },
    } as unknown as ConfigService;
    const storageService = new StorageService(config);
    await storageService.onModuleInit();

    const permissionsService = new PermissionsService(appPrisma as never);
    const profitabilityQueryService = new ProfitabilityQueryService(appPrisma as never);
    const doctorAnalyticsService = new DoctorAnalyticsService(appPrisma as never, permissionsService);
    reportDataService = new ReportDataService(appPrisma as never, permissionsService, profitabilityQueryService, doctorAnalyticsService);
    const reportRendererService = new ReportRendererService();
    reportExportService = new ReportExportService(appPrisma as never, storageService, reportDataService, reportRendererService);
  }, 180_000);

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

  it("generates a real Excel report with correct storage/versioning, assembles correct report data for PDF reports, and masks doctor identity per real RBAC rows", async () => {
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

    const readPermission = await ownerPrisma.permission.upsert({
      where: { code: "doctor_analytics.read" },
      create: { code: "doctor_analytics.read", name: "View aggregate doctor analytics" },
      update: {},
    });
    const readDetailPermission = await ownerPrisma.permission.upsert({
      where: { code: "doctor_analytics.read_detail" },
      create: { code: "doctor_analytics.read_detail", name: "View doctor-identified analytics" },
      update: {},
    });
    const aggregateRole = await ownerPrisma.role.create({ data: { hospitalId: hospital.id, name: "tim_costing_test" } });
    const detailRole = await ownerPrisma.role.create({ data: { hospitalId: hospital.id, name: "direktur_test" } });
    await ownerPrisma.rolePermission.createMany({
      data: [
        { roleId: aggregateRole.id, permissionId: readPermission.id },
        { roleId: detailRole.id, permissionId: readPermission.id },
        { roleId: detailRole.id, permissionId: readDetailPermission.id },
      ],
    });

    const profitCenter = await ownerPrisma.profitCenter.create({
      data: { hospitalId: hospital.id, code: "PC-RJ", name: "Rawat Jalan" },
    });
    const service = await ownerPrisma.service.create({
      data: { hospitalId: hospital.id, profitCenterId: profitCenter.id, code: "SVC-1", name: "Konsultasi", serviceType: "consultation" },
    });
    const doctor = await ownerPrisma.doctor.create({ data: { hospitalId: hospital.id, code: "DOC-1", name: "Dr. Confidential" } });
    const period = await ownerPrisma.period.create({
      data: { hospitalId: hospital.id, label: "2026-01", startDate: new Date("2026-01-01"), endDate: new Date("2026-02-01"), status: "open" },
    });
    const run = await ownerPrisma.allocationRun.create({
      data: { hospitalId: hospital.id, periodId: period.id, method: "direct", status: "completed", createdByUserId: user.id },
    });
    await ownerPrisma.profitabilityResult.create({
      data: {
        allocationRunId: run.id,
        profitCenterId: profitCenter.id,
        revenue: "5000000.00",
        directCost: "0.00",
        allocatedCost: "3000000.00",
        totalCost: "3000000.00",
        grossProfit: "2000000.00",
        margin: "40.0000",
      },
    });
    await ownerPrisma.serviceUnitCost.create({
      data: {
        allocationRunId: run.id,
        serviceId: service.id,
        serviceAllocatedCost: "3000000.00",
        serviceDirectCost: "0.00",
        serviceVolume: "20.00",
        unitCost: "150000.0000",
        currentTariff: "175000.00",
        tariffGap: "25000.0000",
        targetMarginUsed: "15.0000",
        recommendedTariff: "176470.5882",
      },
    });
    const uploadBatch = await ownerPrisma.uploadBatch.create({
      data: {
        hospitalId: hospital.id,
        periodId: period.id,
        type: "medical_activity",
        fileName: "seed.xlsx",
        fileUrl: "seed.xlsx",
        status: "confirmed",
        uploadedByUserId: user.id,
      },
    });
    await ownerPrisma.medicalActivity.createMany({
      data: Array.from({ length: 5 }, () => ({
        hospitalId: hospital.id,
        periodId: period.id,
        serviceId: service.id,
        doctorId: doctor.id,
        volume: "1",
        durationMinutes: 30,
        bmhpCost: "100000.00",
        roomCost: "60000.00",
        staffCost: "40000.00",
        revenue: "600000.00",
        sourceFileId: uploadBatch.id,
      })),
    });
    await ownerPrisma.doctorProfitabilityResult.create({
      data: {
        allocationRunId: run.id,
        doctorId: doctor.id,
        serviceId: service.id,
        revenue: "3000000.00",
        cost: "2800000.00",
        profit: "200000.00",
        margin: "6.6667",
        avgDuration: "30.00",
        avgBmhp: "100000.00",
      },
    });

    // Profitability Detail Excel: real xlsx, real StorageService round-trip
    // (put then get back from real MinIO), round-trips through exceljs's
    // own parser with the expected structure and real numbers. Exercised
    // here rather than a PDF report because exceljs has no ESM/Jest-VM
    // interop issue (see the PDF note below) — the storage + versioning
    // pipeline this proves is identical code for both file types
    // (`ReportExportService.getOrGenerate`, shared by every report type).
    const excel = await runAs(organization.id, hospital.id, () =>
      reportExportService.profitabilityDetailExcel(hospital.id, organization.id, period.id, undefined, false, user.id)
    );
    expect(excel.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.buffer as never);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(
      expect.arrayContaining(["Ringkasan Profit Center", "Detail PC-RJ", "Data Mentah"])
    );
    const summarySheet = workbook.getWorksheet("Ringkasan Profit Center")!;
    expect(summarySheet.getRow(2).getCell(2).value).toBe("Rawat Jalan");
    expect(summarySheet.getRow(2).getCell(3).value).toBe(5000000);
    expect(summarySheet.getRow(2).getCell(8).value).toBeCloseTo(40, 4);

    const exportRows = await ownerPrisma.reportExport.findMany({ where: { hospitalId: hospital.id, reportType: "profitability_detail" } });
    expect(exportRows).toHaveLength(1);
    expect(exportRows[0]!.generatedByUserId).toBe(user.id);
    expect(exportRows[0]!.generatedForPeriodId).toBe(period.id);

    // "Not regenerated in place": a second call without regenerate reuses the same row/bytes.
    const excelAgain = await runAs(organization.id, hospital.id, () =>
      reportExportService.profitabilityDetailExcel(hospital.id, organization.id, period.id, undefined, false, user.id)
    );
    expect(excelAgain.buffer.equals(excel.buffer)).toBe(true);
    const exportRowsAfterCacheHit = await ownerPrisma.reportExport.findMany({
      where: { hospitalId: hospital.id, reportType: "profitability_detail" },
    });
    expect(exportRowsAfterCacheHit).toHaveLength(1);

    // regenerate=true always creates a new row.
    await runAs(organization.id, hospital.id, () =>
      reportExportService.profitabilityDetailExcel(hospital.id, organization.id, period.id, undefined, true, user.id)
    );
    const exportRowsAfterRegenerate = await ownerPrisma.reportExport.findMany({
      where: { hospitalId: hospital.id, reportType: "profitability_detail" },
    });
    expect(exportRowsAfterRegenerate).toHaveLength(2);

    // Executive Summary data assembly (the same data ReportRendererService
    // turns into a PDF) against real Postgres — hospital-wide trend,
    // top/bottom profit centers.
    const executiveData = await runAs(organization.id, hospital.id, () =>
      reportDataService.buildExecutiveSummary(hospital.id, period.id)
    );
    expect(executiveData.totalRevenue).toBe("5000000.00");
    expect(executiveData.totalGrossProfit).toBe("2000000.00");
    expect(executiveData.overallMargin).toBe("40.0000");
    expect(executiveData.topProfitCenters[0]!.profitCenterCode).toBe("PC-RJ");
    expect(executiveData.trend).toEqual([expect.objectContaining({ periodLabel: "2026-01", revenue: "5000000.00" })]);

    // PDF rendering itself (Puppeteer) is deliberately not exercised in this
    // Jest process: puppeteer is ESM-only with no CJS fallback, and ts-jest
    // statically rewrites `import()` to `require()` for CommonJS output,
    // which then fails to load it; bypassing that rewrite (see
    // report-renderer.service.ts's `dynamicImport` helper) hits Jest's own
    // VM sandbox limitation ("A dynamic import callback was invoked without
    // --experimental-vm-modules") — a Node flag not worth toggling
    // globally for the whole test suite just for this one dependency.
    // Manually verified instead: real PDFs generated via curl against the
    // live dev server for all three report types, with their extracted text
    // content checked figure-by-figure against these same hand-verified
    // numbers, and the identified-vs-de-identified Doctor Analytics PDF
    // content confirmed by generating both roles' PDFs side by side.

    // Doctor Analytics masking: real, unambiguous proof that the
    // aggregate-only role's assembled
    // report data has no identified rows at all for any service, regardless
    // of how many doctors performed it.
    const [identifiedData, aggregateData] = await runAs(organization.id, hospital.id, () =>
      Promise.all([
        reportDataService.buildDoctorAnalytics(hospital.id, period.id, undefined, detailRole.name),
        reportDataService.buildDoctorAnalytics(hospital.id, period.id, undefined, aggregateRole.name),
      ])
    );
    expect(identifiedData.hasDetailAccess).toBe(true);
    expect(identifiedData.identifiedByServiceId.get(service.id)).toEqual([
      expect.objectContaining({ doctorId: doctor.id, doctorCode: "DOC-1", doctorName: "Dr. Confidential" }),
    ]);
    expect(aggregateData.hasDetailAccess).toBe(false);
    expect(aggregateData.identifiedByServiceId.size).toBe(0);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
