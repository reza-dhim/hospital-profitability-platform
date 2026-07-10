import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { Observable } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import type { AuthenticatedRequest } from "../../auth/types/authenticated-request.type";
import type { TenantScopedRequest } from "../../tenancy/types/tenant-scoped-request.type";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Global `AuditInterceptor` per docs/23_AUDIT_TRAIL.md §3: writes one
 * `audit_logs` row per successful mutating (POST/PATCH/PUT/DELETE) request.
 * Never runs on a failed request (errors pass through `tap`'s `next`-only
 * handler untouched — no `error` callback is registered).
 *
 * `entity`/`action`/`entityId`/`before`/`after` come from whatever the
 * generic CRUD engine recorded via `AuditContextService` during the request
 * (the richest source — a real before/after diff); when nothing was
 * recorded (e.g. an endpoint that doesn't go through that engine yet, such
 * as auth login or role/permission management), the interceptor falls back
 * to inferring `entity`/`action` from the route and `entityId` from the
 * route param or response body, so coverage stays blanket rather than
 * opt-in per controller.
 *
 * `next.handle()` returns a cold Observable — nothing actually runs until it
 * is *subscribed*, not when it's called. So the `AsyncLocalStorage` store
 * must be opened around the `.subscribe()` call itself (inside a manually
 * constructed `Observable`), not merely around the call that obtains
 * `next.handle()`'s return value: `als.run(store, () => next.handle())`
 * looks right but is a no-op in practice, since `next.handle()` alone (not
 * yet subscribed) doesn't invoke the controller/service — the store would
 * already be closed by the time something actually subscribes to it.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditContextService: AuditContextService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      let teardown: { unsubscribe(): void } | undefined;
      this.auditContextService.runWithNewStore(() => {
        teardown = next.handle().subscribe({
          next: (value) => {
            this.persist(request, value).catch((error) => {
              this.logger.error("Failed to write audit log entry", error instanceof Error ? error.stack : error);
            });
            subscriber.next(value);
          },
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });
      return () => teardown?.unsubscribe();
    });
  }

  private async persist(request: AuthenticatedRequest, responseBody: unknown): Promise<void> {
    const record = this.auditContextService.get();
    const entity = record?.entity ?? this.inferEntity(request);
    const action = record?.action ?? `${entity}.${actionForMethod(request.method)}`;
    const entityId = record?.entityId ?? (request.params?.id as string | undefined) ?? extractId(responseBody) ?? null;
    const ipAddress = request.ip ?? request.socket?.remoteAddress ?? null;
    const hospitalId = (request as TenantScopedRequest).tenantContext?.hospitalId ?? null;

    await this.prisma.auditLog.create({
      data: {
        hospitalId,
        userId: request.user?.sub ?? null,
        action,
        entity,
        entityId,
        // Plain `null` (not `Prisma.JsonNull`) is correct here: these fields
        // are nullable, and we mean "no value recorded", not a literal JSON
        // `null` value — Prisma writes SQL NULL for either given a nullable
        // Json column, so the distinction only matters for required Json
        // fields, which these aren't.
        beforeJson: (record?.before ?? null) as never,
        afterJson: (record?.after ?? responseBody ?? null) as never,
        ipAddress,
      },
    });
  }

  private inferEntity(request: Request): string {
    const routePath = (request as Request & { route?: { path?: string } }).route?.path ?? request.path;
    const segments = routePath.split("/").filter((segment: string) => segment && !segment.startsWith(":"));
    return segments[0]?.replace(/-/g, "_") ?? "unknown";
  }
}

function actionForMethod(method: string): string {
  switch (method) {
    case "POST":
      return "create";
    case "DELETE":
      return "delete";
    default:
      return "update";
  }
}

function extractId(responseBody: unknown): string | undefined {
  if (responseBody && typeof responseBody === "object" && "id" in responseBody) {
    const id = (responseBody as { id: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}
