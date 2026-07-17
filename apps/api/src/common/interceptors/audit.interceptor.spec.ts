import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Observable, firstValueFrom } from "rxjs";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditContextService } from "../../audit/audit-context.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../../auth/types/authenticated-request.type";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeRequest(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    method: "POST",
    path: "/auth/login",
    params: {},
    ip: "203.0.113.5",
    socket: { remoteAddress: "203.0.113.5" },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

function makeContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** Simulates a controller/service that calls `record()` (if provided) while "handling" the request, then emits. */
function handlerThatSucceeds(
  auditContextService: AuditContextService,
  responseBody: unknown,
  record?: Parameters<AuditContextService["record"]>[0]
): CallHandler {
  return {
    handle: () =>
      new Observable((subscriber) => {
        if (record) auditContextService.record(record);
        subscriber.next(responseBody);
        subscriber.complete();
      }),
  };
}

function handlerThatFails(
  auditContextService: AuditContextService,
  error: Error,
  record?: Parameters<AuditContextService["record"]>[0]
): CallHandler {
  return {
    handle: () =>
      new Observable((subscriber) => {
        if (record) auditContextService.record(record);
        subscriber.error(error);
      }),
  };
}

describe("AuditInterceptor", () => {
  function makeDeps() {
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } } as unknown as PrismaService;
    const auditContextService = new AuditContextService();
    const interceptor = new AuditInterceptor(prisma, auditContextService);
    return { prisma, auditContextService, interceptor };
  }

  it("skips non-mutating requests entirely", async () => {
    const { prisma, interceptor } = makeDeps();
    const request = makeRequest({ method: "GET" } as never);
    const handler: CallHandler = { handle: () => new Observable((s) => (s.next("ok"), s.complete())) };

    await firstValueFrom(interceptor.intercept(makeContext(request), handler));

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("falls back to route-inferred entity/action and response-body entityId when nothing was recorded", async () => {
    const { prisma, auditContextService, interceptor } = makeDeps();
    const request = makeRequest({ method: "POST", path: "/hospitals", params: {} } as never);
    const handler = handlerThatSucceeds(auditContextService, { id: "hosp-1" });

    await firstValueFrom(interceptor.intercept(makeContext(request), handler));
    await flushMicrotasks();

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "hospitals",
          action: "hospitals.create",
          entityId: "hosp-1",
          userId: null,
          afterJson: { id: "hosp-1" },
        }),
      })
    );
  });

  it("trusts an explicit record completely and does NOT leak the response body into after_json", async () => {
    const { prisma, auditContextService, interceptor } = makeDeps();
    const request = makeRequest();
    // Simulates AuthService.login(): the response body carries an access token,
    // but the service explicitly recorded a token-free `after`.
    const handler = handlerThatSucceeds(
      auditContextService,
      { accessToken: "signed.jwt.token", expiresIn: 900 },
      { entity: "auth", action: "auth.login.success", entityId: "user-1", userId: "user-1", after: null }
    );

    await firstValueFrom(interceptor.intercept(makeContext(request), handler));
    await flushMicrotasks();

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "auth",
          action: "auth.login.success",
          entityId: "user-1",
          userId: "user-1",
          afterJson: null,
        }),
      })
    );
    const written = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(written)).not.toContain("signed.jwt.token");
  });

  it("uses request.user.sub as userId when the record does not set one explicitly", async () => {
    const { prisma, auditContextService, interceptor } = makeDeps();
    const request = makeRequest({
      path: "/tariffs",
      user: { sub: "authenticated-user", org_id: "org-1", active_hospital_id: "h-1", role: null, permissions_hash: "x" },
    } as never);
    const handler = handlerThatSucceeds(auditContextService, { id: "tariff-1" }, {
      entity: "tariff",
      action: "tariff.create",
      entityId: "tariff-1",
      after: { id: "tariff-1" },
    });

    await firstValueFrom(interceptor.intercept(makeContext(request), handler));
    await flushMicrotasks();

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "authenticated-user" }) })
    );
  });

  it("does not persist a failed request when nothing was recorded (generic failures stay silent)", async () => {
    const { prisma, auditContextService, interceptor } = makeDeps();
    const request = makeRequest();
    const handler = handlerThatFails(auditContextService, new Error("boom"));

    await expect(firstValueFrom(interceptor.intercept(makeContext(request), handler))).rejects.toThrow("boom");
    await flushMicrotasks();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("persists a failed request when the service explicitly recorded one (auth.login.failure)", async () => {
    const { prisma, auditContextService, interceptor } = makeDeps();
    const request = makeRequest();
    const handler = handlerThatFails(auditContextService, new Error("invalid credentials"), {
      entity: "auth",
      action: "auth.login.failure",
      entityId: null,
      userId: null,
      after: { email: "ghost@example.com" },
    });

    await expect(firstValueFrom(interceptor.intercept(makeContext(request), handler))).rejects.toThrow(
      "invalid credentials"
    );
    await flushMicrotasks();

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "auth",
          action: "auth.login.failure",
          entityId: null,
          userId: null,
          afterJson: { email: "ghost@example.com" },
        }),
      })
    );
  });
});
