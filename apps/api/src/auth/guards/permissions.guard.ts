import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { PermissionsService } from "../permissions.service";
import type { AuthenticatedRequest } from "../types/authenticated-request.type";

/**
 * Global, no-op unless a route declares `@RequirePermissions(...)`
 * (docs/04_RBAC.md §6). Live-checks the DB on every call rather than trusting
 * the JWT's `permissions_hash` — see docs/05_AUTHENTICATION.md §4 and
 * TokenService's comment on why that's deferred rather than implemented now.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) return false;

    const grantedCodes = await this.permissionsService.getPermissionCodesForRoleName(
      request.user.active_hospital_id,
      request.user.role
    );
    return requiredPermissions.every((code) => grantedCodes.includes(code));
  }
}
