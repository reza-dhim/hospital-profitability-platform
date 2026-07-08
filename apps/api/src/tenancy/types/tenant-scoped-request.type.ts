import type { Request } from "express";
import type { JwtPayload } from "../../auth/types/jwt-payload.type";
import type { TenantContext } from "../tenant-context";

/** `requestedHospitalId` is set by `TenantMiddleware`; `user` by `JwtAuthGuard`; `tenantContext` by `TenantGuard`. */
export type TenantScopedRequest = Request & {
  requestedHospitalId?: string;
  user?: JwtPayload;
  tenantContext?: TenantContext;
};
