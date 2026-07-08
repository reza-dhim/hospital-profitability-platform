import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedRequest } from "../types/authenticated-request.type";

/**
 * Global, no-op unless a route declares `@Roles(...)` (docs/04_RBAC.md §6).
 * Checks the JWT's `role` claim directly — no DB hit, since role name is
 * already embedded in the token at issuance.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return requiredRoles.includes(request.user?.role ?? "");
  }
}
