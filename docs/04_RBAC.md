# 04 — Role-Based Access Control (RBAC)

Status: Draft v1 — resolves the "Missing RBAC Requirement" gap in `ARCHITECT_AUDIT.md`. User types sourced from `PRD.md` Target Users. Tenancy scoping model: `03_MULTI_TENANT.md`. Doctor-data sensitivity rule: `01_BUSINESS_RULES.md` §7.

## 1. Model

RBAC is **permission-based**, not role-hardcoded: `roles` are named bundles of `permissions` (`{module}.{action}` codes, e.g. `cost_center.write`, `doctor_analytics.read_detail`). A hospital may create custom roles by composing existing permissions; the six default roles below are seeded per hospital on creation and are not deletable (but their permission set can be adjusted by a `System Admin`, with the change audited).

## 2. Default Roles → Permission Summary

| Module | Direktur | CFO/Finance | Tim Costing | Kepala Unit | Manajemen Medis | System Admin |
|---|---|---|---|---|---|---|
| Master Data (CRUD) | Read | Read/Write | Read/Write | Read (own unit) | Read | Read/Write |
| Upload Center | — | Read | Read/Write | — | — | Read/Write |
| Cost Allocation Runs | Read | Read/Write | Read/Write | Read (own unit) | — | Read/Write |
| Profitability Dashboard | Read (all) | Read/Write | Read/Write | Read (own unit) | Read | Read/Write |
| Tariff & Target Margin | Read | Read/Write (approve) | Propose only | — | — | Read/Write |
| Doctor Analytics — detail | Read | Read | — | — | Read | Read |
| Doctor Analytics — aggregate | Read | Read | Read | Read | Read | Read |
| AI Copilot | Read/Use | Read/Use | Read/Use | Read/Use (scoped) | Read/Use | Read/Use |
| AI Proposals — approve | — | Approve | — | — | — | — |
| Reports | Read/Export | Read/Export/Schedule | Read/Export/Schedule | Read/Export (own unit) | Read/Export | Read/Export/Schedule |
| RBAC / User Management | — | — | — | — | — | Read/Write |
| Audit Trail | Read | Read | Read (own actions) | — | — | Read |
| Period Closing / Reopen | — | Read | — | — | — | Read/Write |

"Own unit" = row-level filter to the `cost_center`/`profit_center` the `Kepala Unit` user is assigned to via `user_hospital_memberships.scoped_unit_id` (nullable — null means unrestricted, only valid for roles other than Kepala Unit).

This table is the human-readable summary; the enforced source of truth is the seed data in `role_permissions` (see `24_CONFIGURATION.md` for the seed script reference) — this document must be updated whenever that seed changes.

## 3. Permission Code Convention

`{module}.{action}` — actions are one of: `read`, `write`, `delete`, `export`, `import`, `approve`, `read_detail` (used only for doctor-level data per §5). Modules mirror the 14 PRD modules. Full enumerated list lives in code (`backend/src/rbac/permissions.ts` once scaffolded) — this document defines the policy, not the exhaustive code list, to avoid drift duplication.

## 4. User–Hospital Membership

- A `user_hospital_memberships` table associates one `users` identity to N hospitals, each with its own `role_id` and optional `scoped_unit_id`. This supports both single-hospital staff and multi-hospital group executives (see `03_MULTI_TENANT.md` §4).
- `System Admin` at the organization level manages memberships; a hospital-scoped `System Admin` may only manage memberships within their own hospital.

## 5. Doctor-Level Data Access (Sensitive)

Per `01_BUSINESS_RULES.md` §7, doctor-identified cost/profitability data requires the `doctor_analytics.read_detail` permission, granted by default only to `Manajemen Medis`, `CFO/Finance Director`, `Direktur`, `System Admin`. `Kepala Unit` and `Tim Costing` hold `doctor_analytics.read` (aggregate/de-identified only). This distinction must be enforced at the API layer (query never returns `doctor_id`/`doctor_name` to a caller lacking `read_detail`), not just hidden in the UI.

## 6. Enforcement Mechanism

- NestJS `PermissionsGuard` reads required permissions from a `@RequirePermissions(...)` decorator on each controller method and checks against the authenticated user's resolved permission set (role permissions ∪ any user-level overrides, if v2 introduces those — not in MVP).
- Row-level scoping (`scoped_unit_id`, hospital RLS) is layered on top of the coarse-grained permission check, per `03_MULTI_TENANT.md` §2.
- Every permission-denied request returns HTTP 403 with a standard error shape (`17_ERROR_HANDLING.md`) and is **not** audit-logged as a security event unless repeated denials trigger the rate/abuse threshold in `14_SECURITY.md`.

## 7. Out of Scope for MVP

- Attribute-based access control (ABAC) beyond the `scoped_unit_id` row filter.
- Time-bound/temporary role grants.
- Delegated approval (e.g., CFO delegating tariff-approval to a deputy) — candidate for `40_PRODUCT_ROADMAP.md`.
