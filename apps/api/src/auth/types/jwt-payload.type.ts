/**
 * Access token claim shape, per docs/05_AUTHENTICATION.md §1. Field names
 * mirror the doc's literal wire format (snake_case for the custom claims)
 * since this type describes the token's actual serialized contents, not a
 * general domain object.
 */
export interface JwtPayload {
  /** Subject — the user id. */
  sub: string;
  org_id: string;
  active_hospital_id: string | null;
  /** Role name (e.g. "system_admin"), not the role id — cheap to check in RolesGuard without a DB hit. */
  role: string | null;
  /**
   * Hash of the user's resolved permission codes at issuance time. Reserved
   * for the fast-path freshness optimization in docs/05_AUTHENTICATION.md §4;
   * PermissionsGuard currently live-checks the DB instead of trusting this
   * (see apps/api/src/auth/guards/permissions.guard.ts).
   */
  permissions_hash: string;
}
