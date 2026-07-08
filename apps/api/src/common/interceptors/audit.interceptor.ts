import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { Observable, tap } from "rxjs";

/**
 * Skeleton for docs/23_AUDIT_TRAIL.md §3's global AuditInterceptor. Registered
 * app-wide now so the wiring exists before any mutating endpoint does, but it
 * intentionally writes nothing yet — there is no `audit_logs` table, no
 * authenticated user on the request, and no mutating business endpoint in
 * Sprint 1. Sprint 2+ (once auth + a real entity exist) replaces the no-op
 * body with an actual `audit_logs` write for POST/PATCH/DELETE requests.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);

    if (!isMutating) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.logger.debug(`[audit-skeleton] ${request.method} ${request.url} — not yet persisted`);
      })
    );
  }
}
