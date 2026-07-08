/**
 * Resolved tenant scope for a single request, docs/03_MULTI_TENANT.md §2
 * (application layer). Populated by `TenantGuard` after `JwtAuthGuard` runs,
 * from `TenantResolver`. `hospitalId` is null only for an organization-level
 * user with no membership yet (should not happen in practice once a user has
 * at least one hospital membership, but the JWT's `active_hospital_id` is
 * nullable per docs/05_AUTHENTICATION.md §1, so this mirrors that).
 */
export interface TenantContext {
  organizationId: string;
  hospitalId: string | null;
  userId: string;
}
