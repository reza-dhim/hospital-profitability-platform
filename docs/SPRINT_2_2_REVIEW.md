# Sprint 2.2 Review — Tenancy & RBAC Management

Status: Complete (2026-07-08). Specced by `docs/03_MULTI_TENANT.md` (tenancy model) and `docs/04_RBAC.md` (roles/permissions). Builds directly on Sprint 2.1's auth/guard stack (`docs/SPRINT_2_1_REVIEW.md`).

Note on provenance: most of this sprint's implementation (schema, modules, controllers, services, seed helper) was already written in a prior session that was interrupted by an API error before it reached build/lint/typecheck/test verification, the seed-script integration, and this review. This document reflects the state after resuming: the existing code was audited against `03_MULTI_TENANT.md`/`04_RBAC.md`, one typecheck bug was fixed, `prisma/seed.ts` was updated to use the new shared seeding helper, a tenant-isolation unit test suite was added, and the full verification/release checklist below was run.

## 1. Features Implemented

- **Tenancy CRUD** — `OrganizationController`/`HospitalController`/`BranchController`, each with the standard create/list/get/update/soft-delete set, gated by `organization.*`/`hospital.*`/`branch.*` permissions and paginated (`PaginationQueryDto`, shared across all list endpoints, `page`/`limit`/`search`).
  - `Organization`: `create` is unscoped (no platform-admin surface exists yet, per `03_MULTI_TENANT.md` §3 — deferred); every other operation is restricted to the caller's own organization (`OrganizationService.assertOwnOrganization`).
  - `Hospital`: created under the caller's organization; creation seeds the six default roles with their full permission grants via `seedDefaultRolesForHospital` (`03_MULTI_TENANT.md` §5 onboarding requirement).
  - `Branch`: created under the caller's *effective* hospital (see Tenant Resolution below); optional finer-grained site tagging (`03_MULTI_TENANT.md` §1).
- **Tenant resolution** (`TenantMiddleware` → `TenantGuard` → `TenantResolver`) — resolves the effective `{organizationId, hospitalId, userId}` for every request from the JWT's `org_id`/`active_hospital_id` claims, or, if an `X-Hospital-Id` header is present and differs from the active hospital, validates it against `user_hospital_memberships` before switching context (`03_MULTI_TENANT.md` §4 hospital switcher). Published to request scope via `@CurrentTenant()` and to `AsyncLocalStorage` via `TenantContextService` for non-controller call sites (the latter is unused by any service yet — reserved for the future RLS session-variable wiring called out in `03_MULTI_TENANT.md` §2).
- **`user_hospital_memberships` table** — associates one user identity with N hospitals, each with its own `roleId` and optional `scopedUnitId` (`04_RBAC.md` §4). Not yet written to by any endpoint (see Known Limitations) — currently only read by `TenantResolver` and seedable manually/via Prisma Studio.
- **Permission read endpoint** — `GET /permissions?module=` lists the code-defined catalog (`PERMISSION_CATALOG`, 30 codes across 14 modules); read-only by design, since the catalog is not user-editable (`04_RBAC.md` §3).
- **Role CRUD + permission assignment** — `RoleController`/`RoleService`, hospital-scoped:
  - `POST /roles` — create a custom role with an initial permission set.
  - `GET /roles`, `GET /roles/:id` — list/read, permission codes included and sorted.
  - `PATCH /roles/:id` — rename/redescribe; blocked for default roles (`ROLE_DEFAULT_IMMUTABLE`).
  - `PUT /roles/:id/permissions` — replace a role's permission set wholesale (transaction: delete + recreate `RolePermission` rows); explicitly **allowed** for default roles too, per `04_RBAC.md` §1 ("their permission set can be adjusted by a System Admin").
  - `DELETE /roles/:id` — soft-delete; blocked for default roles.
  - Unknown permission codes in an assignment request are rejected with `PERMISSION_CODE_UNKNOWN` rather than silently ignored.
- **Default role/permission seed helper** (`src/rbac/rbac-seed.ts`) — `seedPermissionCatalog` (idempotent upsert of the full 30-code catalog) and `seedDefaultRolesForHospital` (idempotent upsert of the six default roles + their `04_RBAC.md` §2 grants for one hospital). Framework-free so it runs both from `prisma/seed.ts` and from `HospitalService.create()`.
- **Seeder update** — `prisma/seed.ts` now delegates role/permission seeding to `seedDefaultRolesForHospital` instead of the Sprint 2.1 minimal `rbac.read`/`rbac.write`-only starter set, so the local/demo fixture hospital ("Rumah Sakit Contoh") gets the real default-role grants documented in `04_RBAC.md` §2.
- **`organization.*`/`hospital.*`/`branch.*` permission codes** added to the catalog (not in `04_RBAC.md` §2's original table, which predates tenancy management as an API surface) and granted to `system_admin` (full read/write) and every other default role (`*.read` only, per their existing "Master Data (CRUD)" row intent).

## 2. Database Schema Changes

One migration on top of Sprint 2.1:

| Migration | Change |
|---|---|
| `20260708095508_add_user_hospital_memberships` | New `user_hospital_memberships` table: `userId`, `hospitalId`, `roleId`, nullable `scopedUnitId`, standard audit columns (`createdByUserId`/`updatedByUserId`/`createdAt`/`updatedAt`/`deletedAt`), `@@unique([userId, hospitalId])`. FKs to `users`, `hospitals`, `roles` (all `RESTRICT` on delete), and to `users` again for the two audit-actor columns (`SET NULL`). |

No changes to existing tables. `scopedUnitId` is a bare nullable string column, not yet an FK — it will point at `cost_centers`/`profit_centers` once Sprint 3 adds those tables (`04_RBAC.md` §2 footnote); left unenforced rather than blocking this migration on Sprint 3.

## 3. API Endpoints

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/organizations` | `organization.write` | Unscoped create (no platform-admin surface yet). |
| `GET` | `/organizations` | `organization.read` | Paginated; effectively returns 0 or 1 row (the caller's own org) — see Known Limitations. |
| `GET` | `/organizations/:id` | `organization.read` | 403 if `:id` isn't the caller's own organization. |
| `PATCH` | `/organizations/:id` | `organization.write` | |
| `DELETE` | `/organizations/:id` | `organization.write` | Soft-delete (`204`). |
| `POST` | `/hospitals` | `hospital.write` | Under caller's org; triggers default-role seeding. |
| `GET` | `/hospitals`, `GET /hospitals/:id` | `hospital.read` | Scoped to caller's org, paginated, search by name/code. |
| `PATCH` | `/hospitals/:id` | `hospital.write` | |
| `DELETE` | `/hospitals/:id` | `hospital.write` | Soft-delete (`204`). |
| `POST` | `/branches` | `branch.write` | Under caller's *effective* hospital; `400 TENANT_HOSPITAL_REQUIRED` if none. |
| `GET` | `/branches`, `GET /branches/:id` | `branch.read` | Same hospital-context requirement. |
| `PATCH` | `/branches/:id` | `branch.write` | |
| `DELETE` | `/branches/:id` | `branch.write` | Soft-delete (`204`). |
| `GET` | `/permissions?module=` | `rbac.read` | Read-only catalog listing. |
| `POST` | `/roles` | `rbac.write` | Custom role in caller's active hospital. |
| `GET` | `/roles`, `GET /roles/:id` | `rbac.read` | Hospital-scoped, paginated. |
| `PATCH` | `/roles/:id` | `rbac.write` | `403 ROLE_DEFAULT_IMMUTABLE` for default roles. |
| `PUT` | `/roles/:id/permissions` | `rbac.write` | Full replace; allowed for default roles. |
| `DELETE` | `/roles/:id` | `rbac.write` | Soft-delete; `403 ROLE_DEFAULT_IMMUTABLE` for default roles. |

All endpoints above require a bearer access token (global `JwtAuthGuard`, Sprint 2.1) and now additionally pass through the global `TenantGuard` registered by `TenancyModule`. Requests missing a required hospital context (branch/role endpoints with no active hospital) return `400 TENANT_HOSPITAL_REQUIRED`.

## 4. Security & Design Decisions

- **Guard ordering**: `TenantGuard` is registered as a second global `APP_GUARD`, after Sprint 2.1's `JwtAuthGuard`/`RolesGuard`/`PermissionsGuard` — `AppModule` imports `AuthModule` before `TenancyModule`, and Nest's `APP_GUARD` providers run in registration order, so tenant resolution always sees an already-authenticated `request.user`.
- **`TenantMiddleware` vs. `TenantGuard` split**: Express middleware runs before Nest's guard phase and can't read `request.user` yet, so it only opens the `AsyncLocalStorage` store and lifts the `X-Hospital-Id` header onto the request; `TenantGuard` does the actual resolution once identity is known. This two-step split is why tenant context needs both a middleware *and* a guard rather than just one.
- **Hospital-switch validation is defense-in-depth against a forged header**: presenting `X-Hospital-Id` for a hospital the caller has no membership row for — or one belonging to a different organization, or one that's soft-deleted — is rejected with `403 TENANT_HOSPITAL_FORBIDDEN` before any downstream query runs. Covered by the new `tenant.resolver.spec.ts` suite (see §5).
- **Default roles remain permission-editable but not renamable/deletable**: `RoleService.assignPermissions` deliberately does not call `requireMutableRole` (which blocks default roles), matching `04_RBAC.md` §1's explicit carve-out — a System Admin must be able to correct a default role's grants without cloning it into a custom role first.
- **`seedDefaultRolesForHospital` is idempotent by design** (every write is an upsert) so it's safe to call both from the standalone seed script and from `HospitalService.create()` without needing a "has this hospital been seeded" guard column.
- **Doctor-analytics detail permission** (`doctor_analytics.read_detail`) is seeded per `04_RBAC.md` §5's restricted grant list (`direktur`, `cfo_finance_director`, `manajemen_medis`, `system_admin` only) — enforcement at the query layer is Sprint 3+ scope (no doctor-analytics queries exist yet), but the permission code and its grants exist now so that sprint doesn't have to touch this seed data.

## 5. Test Coverage

Full workspace `test` was already green (46 tests, Sprint 2.1) before this sprint's own additions. Added:

| File | Covers |
|---|---|
| `tenant.resolver.spec.ts` (6 tests) | Active-hospital fast path (no DB lookup needed), header matching active hospital (no DB lookup), valid cross-hospital membership switch, rejection of a header with no membership row, rejection of a membership resolving to a different organization, rejection of a membership pointing at a soft-deleted hospital. |

Total: **52 tests, 10 suites, all passing.**

Deliberately not added this sprint (see Known Limitations): controller-level 403 tests for the new `RequirePermissions` codes (`organization.*`/`hospital.*`/`branch.*`), integration tests against a real Postgres instance for `RoleService`/`OrganizationService`/`HospitalService`/`BranchService`, and the `docs/33_TESTING_STRATEGY.md` §1 "Tenant Isolation" integration suite (which requires Testcontainers, not yet wired into this repo). `TenantResolver` was prioritized because it's the single choke point all tenant isolation flows through — everything else is straightforward CRUD following the same scoped-query pattern already exercised manually (see §6).

## 6. Manual Verification

Run against the local Postgres dev container (`localhost:5433`) as part of this review, in addition to the automated suite:

- `npx prisma migrate status` — schema already in sync with the one new migration (previously applied).
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` — all green.
- `npm run prisma:seed` — ran end-to-end; verified via direct SQL that all six default roles received their exact `04_RBAC.md` §2 permission counts (`cfo_finance_director`: 22, `direktur`: 13, `kepala_unit`: 10, `manajemen_medis`: 10, `system_admin`: 26, `tim_costing`: 18).
- Booted the compiled API (`node dist/main.js`) — clean startup, all new routes mapped (`/organizations`, `/hospitals`, `/branches`, `/roles`, `/roles/:id/permissions`, `/permissions`).
- Live smoke test: logged in as the seeded Super Admin, then called `GET /permissions`, `GET /organizations`, `GET /hospitals` with the resulting bearer token — all three returned the expected seeded data.

## 7. Known Limitations (Deliberately Out of Scope)

- **No membership management endpoints.** `user_hospital_memberships` rows can only be created via direct DB access (Prisma Studio / SQL) today — there is no `POST /users/:id/memberships` or similar. `04_RBAC.md` §4 assigns this to "System Admin manages memberships"; the endpoint itself is deferred to a future sprint.
- **Login/token issuance is not membership-aware.** A user's JWT `active_hospital_id`/`role` claims still come from the Sprint 1 `User.hospitalId`/`User.roleId` columns (the Sprint 1 single-hospital simplification), not from `user_hospital_memberships`. The membership table is only consulted when a caller presents `X-Hospital-Id` to switch into a *non-active* hospital. A true multi-hospital login/hospital-switcher flow needs `AuthService` updated to consider memberships at issuance time.
- **`Organization.findAll` is a placeholder for multi-org membership.** It always scopes to the caller's single `tenantOrgId` (from the JWT), returning 0 or 1 rows — there is no concept yet of a user belonging to multiple organizations, so "list my organizations" is currently just "look up the one I have."
- **RLS (Postgres Row-Level Security) is still not implemented.** `TenantContextService`'s `AsyncLocalStorage` store exists specifically so a future Prisma middleware can `SET app.current_org_id`/`app.current_hospital_id` for RLS policies (`03_MULTI_TENANT.md` §2), but nothing sets those session variables yet and no RLS policies exist. Tenant isolation today is application-layer only (scoped Prisma queries), same gap flagged as outstanding in `docs/SPRINT_2_1_REVIEW.md` §8.
- **No integration/Testcontainers suite.** All new tests are unit-level with mocked `PrismaService`; the `docs/33_TESTING_STRATEGY.md` §1 "Tenant Isolation" integration layer (real Postgres, asserts no cross-tenant query leakage) is not set up in this repo yet.
- **`scopedUnitId` is unenforced.** The column exists on `user_hospital_memberships` but nothing reads it — row-level "own unit" filtering for `Kepala Unit` (`04_RBAC.md` §2 footnote) can't be implemented until Sprint 3 adds `cost_centers`/`profit_centers`.
- **Global audit-trail interceptor** (flagged as an open Sprint 2 item in `docs/SPRINT_2_1_REVIEW.md` §8) is still not wired to real writes — organization/hospital/branch/role mutations are not yet appearing in `audit_logs`.

## 8. Lessons Learned

- Splitting tenant resolution into a middleware (opens the `AsyncLocalStorage` store, lifts the header) and a guard (does the actual resolution once `request.user` exists) avoided fighting Nest's request lifecycle ordering — trying to do header validation in the guard alone would have worked too, but the middleware's only job (opening the store early) turned out to be necessary regardless, since `TenantContextService.set()` requires an already-open store.
- Making `seedDefaultRolesForHospital` framework-free (plain `PrismaClient` parameter, not a Nest-injected service) paid off immediately: it's called from two very different contexts (a standalone `ts-node` script and a request-scoped `HospitalService` method) that would otherwise have needed either code duplication or a heavier shared-module abstraction.
- Prioritizing a `TenantResolver` unit-test suite over broader controller-level coverage was a deliberate scope cut given limited time in this resumed session — it's the one piece of new logic where a bug has cross-tenant data exposure as its failure mode, versus CRUD services where a bug mostly just breaks one hospital's own data.

## 9. Next Sprint Dependencies

Per `docs/SPRINT_2_1_REVIEW.md` §8, Sprint 2 was already carrying two forward items before this sprint; Sprint 2.2 adds a third. Before Sprint 3 (Master Data):

- **Postgres Row-Level Security** for org/hospital scoping — still outstanding (carried from Sprint 2.1).
- **Global audit-trail interceptor** wired to real writes — still outstanding (carried from Sprint 2.1); now also missing coverage for this sprint's own organization/hospital/branch/role mutations.
- **Membership management endpoints + membership-aware login** — new from this sprint. Sprint 3's Master Data work assumes `Kepala Unit`'s `scoped_unit_id` row filtering will eventually work; that requires memberships to be assignable through the API, not just seedable by hand.

Any Sprint 3 work that assumes multi-hospital membership, RLS, or audit logging is already fully wired should not proceed until these are addressed or the assumption is explicitly documented as a known gap.
