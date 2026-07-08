import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { JwtPayload } from "../types/jwt-payload.type";
import type { AuthenticatedRequest } from "../types/authenticated-request.type";

/** Injects the authenticated request's JWT payload into a controller method parameter. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
