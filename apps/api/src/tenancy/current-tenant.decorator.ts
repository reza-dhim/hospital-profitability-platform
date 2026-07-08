import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { TenantContext } from "./tenant-context";
import type { TenantScopedRequest } from "./types/tenant-scoped-request.type";

/** Injects the request's `TenantContext`, resolved by `TenantGuard`. Only valid on non-`@Public()` routes. */
export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const request = ctx.switchToHttp().getRequest<TenantScopedRequest>();
  if (!request.tenantContext) {
    throw new Error("CurrentTenant used on a route with no resolved TenantContext (is TenantGuard registered?).");
  }
  return request.tenantContext;
});
