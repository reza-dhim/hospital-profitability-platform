import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { PermissionsService } from "../auth/permissions.service";
import { DoctorAnalyticsService } from "./doctor-analytics.service";
import type { DoctorComparisonAggregateResponseDto, DoctorComparisonIdentifiedResponseDto } from "./dto/doctor-comparison-response.dto";

/**
 * docs/04_RBAC.md §5's hard requirement: the identified-vs-aggregate
 * masking "must be enforced at the API layer ... not just hidden in the
 * UI". A mocked-Prisma unit test (doctor-analytics.service.spec.ts) already
 * proves the branching logic; this proves it against a REAL permission
 * resolution — real `roles`/`role_permissions`/`permissions` rows, RLS-scoped
 * — for a `tim_costing`-shaped role (aggregate only) and a
 * `direktur`-shaped role (`read_detail`), asserting on raw response JSON
 * keys that a doctor identifier never appears for the aggregate role.
 */
describe("DoctorAnalyticsService RBAC masking (real Postgres + real RBAC)", () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let doctorAnalyticsService: DoctorAnalyticsService;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_doctor_analytics_test")
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
    const appUrl = `postgresql://hpp_app:hpp_app@${pgHost}:${pgPort}/hpp_doctor_analytics_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    const permissionsService = new PermissionsService(appPrisma as never);
    doctorAnalyticsService = new DoctorAnalyticsService(appPrisma as never, permissionsService);
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

  it("returns a de-identified response for an aggregate-only role and a fully identified response (with factors) for a read_detail role, from the same underlying data", async () => {
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

    // Real RBAC rows — mirrors docs/04_RBAC.md §5's actual grant shape,
    // not a mocked permission list.
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
    const doctorA = await ownerPrisma.doctor.create({ data: { hospitalId: hospital.id, code: "DOC-A", name: "Dr. Confidential A" } });
    const doctorB = await ownerPrisma.doctor.create({ data: { hospitalId: hospital.id, code: "DOC-B", name: "Dr. Confidential B" } });

    const period = await ownerPrisma.period.create({
      data: { hospitalId: hospital.id, label: "2026-01", startDate: new Date("2026-01-01"), endDate: new Date("2026-02-01"), status: "open" },
    });
    const run = await ownerPrisma.allocationRun.create({
      data: { hospitalId: hospital.id, periodId: period.id, method: "direct", status: "completed", createdByUserId: user.id },
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
    // "Case count" (docs/11_DOCTOR_ANALYTICS.md §3's minimum sample size) is
    // the number of `medical_activities` ROWS, not the `volume` field on any
    // one row — doctorA gets 5 separate case rows (meets the minimum),
    // doctorB gets 2 (below it), each row representing one activity instance.
    await ownerPrisma.medicalActivity.createMany({
      data: [
        ...Array.from({ length: 5 }, () => ({
          hospitalId: hospital.id,
          periodId: period.id,
          serviceId: service.id,
          doctorId: doctorA.id,
          volume: "1",
          durationMinutes: 30,
          bmhpCost: "100000.00",
          roomCost: "60000.00",
          staffCost: "40000.00",
          revenue: "600000.00",
          sourceFileId: uploadBatch.id,
        })),
        ...Array.from({ length: 2 }, () => ({
          hospitalId: hospital.id,
          periodId: period.id,
          serviceId: service.id,
          doctorId: doctorB.id,
          volume: "1",
          durationMinutes: 45,
          bmhpCost: "200000.00",
          roomCost: "100000.00",
          staffCost: "50000.00",
          revenue: "1000000.00",
          sourceFileId: uploadBatch.id,
        })),
      ],
    });
    await ownerPrisma.doctorProfitabilityResult.createMany({
      data: [
        {
          allocationRunId: run.id,
          doctorId: doctorA.id,
          serviceId: service.id,
          revenue: "3000000.00",
          cost: "2800000.00",
          profit: "200000.00",
          margin: "6.6667",
          avgDuration: "30.00",
          avgBmhp: "500000.00",
        },
        {
          allocationRunId: run.id,
          doctorId: doctorB.id,
          serviceId: service.id,
          revenue: "2000000.00",
          cost: "1900000.00",
          profit: "100000.00",
          margin: "5.0000",
          avgDuration: "45.00",
          avgBmhp: "400000.00",
        },
      ],
    });

    // Aggregate role: tim_costing-shaped, holds only doctor_analytics.read.
    const aggregateResult = await runAs(organization.id, hospital.id, () =>
      doctorAnalyticsService.comparison(hospital.id, service.id, { periodId: period.id, doctorId: doctorA.id }, aggregateRole.name)
    );
    expect("doctorId" in aggregateResult).toBe(false);
    expect("bands" in aggregateResult).toBe(true);
    const aggregateJson = JSON.stringify(aggregateResult);
    // The real, unambiguous proof: neither doctor's id, code, or name appears
    // ANYWHERE in the raw response, not just absent from typed fields.
    expect(aggregateJson).not.toContain(doctorA.id);
    expect(aggregateJson).not.toContain(doctorB.id);
    expect(aggregateJson).not.toContain("DOC-A");
    expect(aggregateJson).not.toContain("DOC-B");
    expect(aggregateJson).not.toContain("Dr. Confidential");
    const aggregate = aggregateResult as DoctorComparisonAggregateResponseDto;
    expect(aggregate.bands.reduce((sum, b) => sum + b.doctorCount, 0)).toBeGreaterThanOrEqual(0);

    // Detail role: direktur-shaped, holds doctor_analytics.read_detail too.
    const identifiedResult = await runAs(organization.id, hospital.id, () =>
      doctorAnalyticsService.comparison(hospital.id, service.id, { periodId: period.id, doctorId: doctorA.id }, detailRole.name)
    );
    const identified = identifiedResult as DoctorComparisonIdentifiedResponseDto;
    expect(identified.doctorId).toBe(doctorA.id);
    expect(identified.doctorCode).toBe("DOC-A");
    expect(identified.caseCount).toBe(5);
    expect(identified.sufficientSample).toBe(true);
    expect(identified.factors).toHaveLength(4);

    // Same detail role, but omitting doctorId -> still de-identified (server
    // never infers "show me somebody" — an explicit doctorId is required).
    const detailNoDoctorId = await runAs(organization.id, hospital.id, () =>
      doctorAnalyticsService.comparison(hospital.id, service.id, { periodId: period.id }, detailRole.name)
    );
    expect("doctorId" in detailNoDoctorId).toBe(false);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
