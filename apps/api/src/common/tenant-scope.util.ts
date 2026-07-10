import { BadRequestException } from "@nestjs/common";
import type { TenantContext } from "../tenancy/tenant-context";

/**
 * Every master-data entity is hospital-scoped (docs/02_DOMAIN_MODEL.md §4),
 * so every generic-CRUD-engine endpoint needs an active hospital the same
 * way `BranchService`/`RoleService` already require one — shared here so
 * that check (and its error shape) isn't re-declared per entity.
 */
export function requireHospitalId(tenant: TenantContext): string {
  if (!tenant.hospitalId) {
    throw new BadRequestException({
      code: "TENANT_HOSPITAL_REQUIRED",
      message: "This action requires an active hospital context (switch hospital via the X-Hospital-Id header).",
    });
  }
  return tenant.hospitalId;
}
