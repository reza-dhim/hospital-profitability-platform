/**
 * The six default hospital roles, per docs/04_RBAC.md §2. Shared between the
 * Prisma seed script (apps/api) and any role-aware UI (apps/web) so the two
 * never drift on naming. Permission-to-role mapping is Sprint 2 scope
 * (docs/04_RBAC.md, docs/24_CONFIGURATION.md §4) — this enum only fixes the names.
 */
export const DEFAULT_ROLE_NAMES = [
  "direktur",
  "cfo_finance_director",
  "tim_costing",
  "kepala_unit",
  "manajemen_medis",
  "system_admin",
] as const;

export type DefaultRoleName = (typeof DEFAULT_ROLE_NAMES)[number];
