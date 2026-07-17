import { execFileSync } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Prisma, PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Observable, firstValueFrom, from } from "rxjs";
import { UnauthorizedException } from "@nestjs/common";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { tenantRlsExtension } from "../prisma/tenant-rls.extension";
import { AuditInterceptor } from "../common/interceptors/audit.interceptor";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { PermissionsService } from "./permissions.service";
import type { AuthenticatedRequest } from "./types/authenticated-request.type";

/**
 * Proves docs/23_AUDIT_TRAIL.md §3's "login success/failure logged by the
 * auth module directly for security monitoring" promise actually holds
 * end-to-end: real `AuthService` + real `AuditContextService` +
 * real `AuditInterceptor` + real Postgres RLS (`hpp_app`, not the schema
 * owner). A unit test with a mocked Prisma client cannot verify the RLS
 * scoping claim in this task's plan (§d) — no SQL is sent, no policy is
 * evaluated — so this lives in `*.integration-spec.ts` like
 * `tenant-isolation.integration-spec.ts`, which this file mirrors the setup
 * of.
 */
describe("Auth audit trail (RLS)", () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let ownerUrl: string;
  let appUrl: string;
  let ownerPrisma: PrismaClient;
  let appPrisma: ReturnType<typeof buildAppClient>;
  let tenantContextService: TenantContextService;
  let auditContextService: AuditContextService;
  let auditInterceptor: AuditInterceptor;
  let authService: AuthService;
  let passwordService: PasswordService;

  const knownPassword = "Correct-Horse-Battery-Staple-1";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("hpp_auth_audit_test")
      .withUsername("hpp")
      .withPassword("hpp")
      .start();

    ownerUrl = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: path.resolve(__dirname, "../.."),
      env: { ...process.env, DATABASE_URL: ownerUrl },
      stdio: "inherit",
    });

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    appUrl = `postgresql://hpp_app:hpp_app@${host}:${port}/hpp_auth_audit_test?schema=public`;

    ownerPrisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
    tenantContextService = new TenantContextService();
    appPrisma = buildAppClient(appUrl, tenantContextService);
    await ownerPrisma.$connect();

    auditContextService = new AuditContextService();
    auditInterceptor = new AuditInterceptor(appPrisma as never, auditContextService);
    passwordService = new PasswordService();

    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const config = {
      get: (key: string) => (key === "JWT_ACCESS_PRIVATE_KEY" ? privateKey : key === "JWT_ACCESS_PUBLIC_KEY" ? publicKey : undefined),
    } as unknown as ConfigService;
    const tokenService = new TokenService(new JwtService(), config);
    const permissionsService = new PermissionsService(appPrisma as never);

    authService = new AuthService(
      appPrisma as never,
      tenantContextService,
      passwordService,
      tokenService,
      permissionsService,
      auditContextService
    );
  }, 120_000);

  afterAll(async () => {
    await ownerPrisma.$disconnect();
    await appPrisma.$disconnect();
    await container.stop();
  });

  async function seedUser(password: string) {
    const organization = await ownerPrisma.organization.create({ data: { name: `Org ${randomUUID()}` } });
    const hospital = await ownerPrisma.hospital.create({
      data: { organizationId: organization.id, name: `Hospital ${randomUUID()}`, code: randomUUID().slice(0, 8) },
    });
    const passwordHash = await passwordService.hash(password);
    const user = await ownerPrisma.user.create({
      data: {
        organizationId: organization.id,
        hospitalId: hospital.id,
        name: "Actor User",
        email: `${randomUUID()}@example.test`,
        passwordHash,
        status: "active",
      },
    });
    return { organization, hospital, user };
  }

  function runAs<T>(orgId: string, hospitalId: string | null, fn: () => Promise<T>): Promise<T> {
    return tenantContextService.runWithNewStore(async () => {
      tenantContextService.set({ organizationId: orgId, hospitalId, userId: "test-user" });
      return await fn();
    });
  }

  /** Drives `work` through the real `AuditInterceptor`, exactly like a real request would. */
  function runRequest<T>(routePath: string, ip: string, work: () => Promise<T>): Promise<T> {
    const request = {
      method: "POST",
      path: routePath,
      params: {},
      ip,
      socket: { remoteAddress: ip },
    } as unknown as AuthenticatedRequest;
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => from(work()) };

    // Must `await` inside the `runWithNewStore` callback, not just return the
    // promise it hands back — see `tenant-isolation.integration-spec.ts`'s
    // `runAs` for why (AsyncLocalStorage continuation lifetime).
    return tenantContextService.runWithNewStore(async () => {
      return await firstValueFrom(auditInterceptor.intercept(context, handler) as Observable<T>);
    });
  }

  /** The interceptor's DB write is fire-and-forget (see its class doc comment) — poll for it. */
  async function waitForAuditRows(where: Prisma.AuditLogWhereInput) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const rows = await ownerPrisma.auditLog.findMany({ where });
      if (rows.length > 0) return rows;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return [];
  }

  it("login success writes an audit_logs row with the real user_id, null hospital_id, and no token in after_json", async () => {
    const { user } = await seedUser(knownPassword);

    await runRequest("/auth/login", "198.51.100.10", () =>
      authService
        .login(user.email, knownPassword, { ipAddress: "198.51.100.10" })
        .then((tokens) => ({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn }))
    );

    const rows = await waitForAuditRows({ action: "auth.login.success", userId: user.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hospitalId).toBeNull();
    expect(rows[0]?.entity).toBe("auth");
    expect(rows[0]?.entityId).toBe(user.id);
    expect(rows[0]?.ipAddress).toBe("198.51.100.10");
    expect(rows[0]?.afterJson).toBeNull();
    expect(JSON.stringify(rows[0])).not.toMatch(/eyJ/); // no JWT (base64url header starts "eyJ") anywhere in the row
  });

  it("login failure with an unmatched email writes a userless row carrying the attempted email, no password", async () => {
    const attemptedEmail = `ghost-${randomUUID()}@example.test`;

    await expect(
      runRequest("/auth/login", "198.51.100.11", () => authService.login(attemptedEmail, "whatever-password", {}))
    ).rejects.toThrow(UnauthorizedException);

    const rows = await waitForAuditRows({ action: "auth.login.failure", entity: "auth" });
    const row = rows.find((r) => (r.afterJson as { email?: string } | null)?.email === attemptedEmail);
    expect(row).toBeTruthy();
    expect(row?.userId).toBeNull();
    expect(row?.hospitalId).toBeNull();
    expect(JSON.stringify(row)).not.toContain("whatever-password");
  });

  it("login failure with a wrong password writes a row referencing the real user_id", async () => {
    const { user } = await seedUser(knownPassword);

    await expect(
      runRequest("/auth/login", "198.51.100.12", () => authService.login(user.email, "totally-wrong-password", {}))
    ).rejects.toThrow(UnauthorizedException);

    const rows = await waitForAuditRows({ action: "auth.login.failure", userId: user.id });
    expect(rows).toHaveLength(1);
    expect((rows[0]?.afterJson as { email?: string } | null)?.email).toBe(user.email);
    expect(JSON.stringify(rows[0])).not.toContain("totally-wrong-password");
  });

  it("refresh writes an auth.refresh row for the rotated session's user_id", async () => {
    const { user } = await seedUser(knownPassword);
    const tokens = await runRequest("/auth/login", "198.51.100.13", () =>
      authService.login(user.email, knownPassword, {})
    );

    await runRequest("/auth/refresh", "198.51.100.13", () =>
      authService
        .refresh(tokens.refreshToken, {})
        .then((t) => ({ accessToken: t.accessToken, expiresIn: t.expiresIn }))
    );

    const rows = await waitForAuditRows({ action: "auth.refresh", userId: user.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hospitalId).toBeNull();
    expect(rows[0]?.afterJson).toBeNull();
  });

  it("logout writes an auth.logout row for the revoked session's user_id", async () => {
    const { user } = await seedUser(knownPassword);
    const tokens = await runRequest("/auth/login", "198.51.100.14", () =>
      authService.login(user.email, knownPassword, {})
    );

    await runRequest("/auth/logout", "198.51.100.14", () => authService.logout(tokens.refreshToken));

    const rows = await waitForAuditRows({ action: "auth.logout", userId: user.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hospitalId).toBeNull();
  });

  it("scopes a login-success row to its own organization once user_id is populated — a different org cannot see it under RLS", async () => {
    const tenantA = await seedUser(knownPassword);
    const tenantB = await seedUser(knownPassword);

    await runRequest("/auth/login", "198.51.100.15", () =>
      authService.login(tenantA.user.email, knownPassword, {})
    );
    await waitForAuditRows({ action: "auth.login.success", userId: tenantA.user.id });

    const rowsAsOwnOrg = await runAs(tenantA.organization.id, tenantA.hospital.id, () =>
      appPrisma.auditLog.findMany({ where: { action: "auth.login.success", userId: tenantA.user.id } })
    );
    expect(rowsAsOwnOrg).toHaveLength(1);

    const rowsAsOtherOrg = await runAs(tenantB.organization.id, tenantB.hospital.id, () =>
      appPrisma.auditLog.findMany({ where: { action: "auth.login.success", userId: tenantA.user.id } })
    );
    expect(rowsAsOtherOrg).toHaveLength(0);
  });
});

function buildAppClient(url: string, tenantContextService: TenantContextService) {
  const base = new PrismaClient({ datasources: { db: { url } } });
  return base.$extends(tenantRlsExtension(tenantContextService));
}
