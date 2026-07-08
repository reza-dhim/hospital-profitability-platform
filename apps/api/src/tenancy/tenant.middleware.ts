import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { TenantContextService } from "./tenant-context.service";
import { REQUESTED_HOSPITAL_HEADER } from "./tenant.constants";
import type { TenantScopedRequest } from "./types/tenant-scoped-request.type";

/**
 * Runs before Nest's guard phase (Express middleware, not a guard), so it
 * cannot yet read `request.user` — `JwtAuthGuard` hasn't run. Its job is
 * narrow: open the per-request `AsyncLocalStorage` store so
 * `TenantContextService.set()` (called later, by `TenantGuard`) has
 * somewhere to write, and lift the optional `X-Hospital-Id` header
 * (docs/03_MULTI_TENANT.md §4 hospital switcher) onto the request for
 * `TenantGuard`/`TenantResolver` to validate once the caller's identity is known.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers[REQUESTED_HOSPITAL_HEADER];
    (req as TenantScopedRequest).requestedHospitalId = Array.isArray(header) ? header[0] : header;

    this.tenantContextService.runWithNewStore(() => next());
  }
}
