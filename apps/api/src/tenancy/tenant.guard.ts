import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator";
import { TenantResolver } from "./tenant.resolver";
import { TenantContextService } from "./tenant-context.service";
import type { TenantScopedRequest } from "./types/tenant-scoped-request.type";

/**
 * Global, registered after the Sprint 2.1 auth guard stack (docs/03_MULTI_TENANT.md
 * §2 application layer). Skips `@Public()` routes the same way `JwtAuthGuard`
 * does — there is no user to resolve a tenant for. For every other route,
 * resolves the effective hospital via `TenantResolver`, publishes it to
 * `TenantContextService` (the `AsyncLocalStorage` store `TenantMiddleware`
 * opened) and onto `request.tenantContext` for direct injection via
 * `@CurrentTenant()`.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantResolver: TenantResolver,
    private readonly tenantContextService: TenantContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    if (!request.user) return false;

    const tenantContext = await this.tenantResolver.resolve(request.user, request.requestedHospitalId);
    request.tenantContext = tenantContext;
    this.tenantContextService.set(tenantContext);

    return true;
  }
}
