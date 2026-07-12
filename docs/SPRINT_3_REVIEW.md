# Sprint 3 Review — Master Data

Status: Complete (2026-07-12). Commits `afbf990` (entities + generic CRUD engine), `b250f75` (audit logging), `2c73176` (Swagger schema pass), `93dd50b` (demo seed fixture). Specced by `docs/02_DOMAIN_MODEL.md` §2, `docs/22_ACCEPTANCE_CRITERIA.md` §2, `docs/23_AUDIT_TRAIL.md`, `docs/24_CONFIGURATION.md`, and `docs/28_OPENAPI_STRATEGY.md` §4. Builds on Sprint 2.2's tenancy/RBAC guard stack (`docs/SPRINT_2_2_REVIEW.md`).

**Note on test coverage up front** (expanded in §5/§7): this sprint shipped with **zero new automated tests**. The 52 passing tests referenced below are entirely pre-existing (Sprint 2.1 auth + Sprint 2.2 tenancy). None of Sprint 3's own code — the generic CRUD engine, any of the 13 entity services/controllers, the audit interceptor, or the seed helper — has a `.spec.ts` file. This is the single largest gap carried into Sprint 4 and should not be read past without registering it.

## 1. Features Implemented

- **13 master-data entities**, all hospital-scoped, soft-deletable, with the standard create/list/get/update/soft-delete set: `CostCenter`, `ProfitCenter`, `Driver`, `AllocationRule`, `CoaAccount`, `Doctor`, `Service`, `Employee`, `Asset`, `Vendor`, `BmhpItem`, `Tariff`, `HospitalSettings`.
- **Generic CRUD engine** (`common/crud/master-data-crud.service.ts`) — one abstract `MasterDataCrudService<TEntity, TCreateDto, TUpdateDto>` implementing create/findAll/findOne/update/remove once; every entity service is a thin subclass wiring its own Prisma delegate + `MasterDataCrudOptions`. Handles pagination/search/filter/sort (via `common/query/list-query.util.ts`'s per-entity `CrudFieldConfig` allow-lists), soft-delete, `P2002`-to-409 unique-conflict translation, and audit-context recording in one place.
- **List query support** — `?page`, `?limit`, `?search`, `?sort=field`/`?sort=-field`, `?filter[field]=value` (exact match, allow-listed per entity) — shared `ListQueryDto`/`buildListArgs`, not re-derived per entity.
- **Audit logging** — `AuditContextService` (`AsyncLocalStorage`-backed) lets the CRUD engine record a real before/after diff during a request; global `AuditInterceptor` persists one `audit_logs` row per successful mutating request (POST/PATCH/PUT/DELETE), falling back to route/response inference for endpoints that don't go through the generic engine yet (e.g. auth, RBAC). Never fires on a failed request.
- **`GET /audit-logs`** — tenant-scoped, paginated, filterable by entity/user/date range (`audit.controller.ts`, `AuditLogQueryDto`).
- **Demo seed fixture** (`src/master-data/master-data-seed.ts`, wired into `prisma/seed.ts`) — Indonesian-terminology fixture data for all 13 entities plus `hospital_settings`, idempotent via upsert.
- **Swagger schema pass** (`2c73176`, docs-only) — list endpoints now correctly declare the `{data, meta}` pagination envelope instead of a bare array; `@ApiParam` on `:id` routes; `@ApiNotFoundResponse` (404) on `findOne`/`update`/`remove`; `@ApiConflictResponse` (409) on `create`/`update`; `@ApiQuery` documenting each entity's actual filterable fields for the previously-untyped `?filter[x]=y` param.

## 2. Database Schema Changes

Four migrations on top of Sprint 2.2:

| Migration | Change |
|---|---|
| `20260709090131_add_master_data_entities` | Adds all 13 entity tables + `AllocationRule`'s compound-key constraint + `hospitalId`/`code` unique constraints per entity. |
| `20260709090212_add_audit_logs` | New `audit_logs` table: `user_id` (FK → `users`, `ON DELETE SET NULL`), `action`, `entity`, `entity_id`, `before_json`, `after_json`, `ip_address`, `created_at`; indexed on `(entity, entity_id)`, `user_id`, `created_at`. |
| `20260709090513_add_audit_log_hospital_id` | Adds `hospital_id` to `audit_logs` for tenant-scoped listing. |
| `20260709100408_fix_hospital_settings_defaults` | Corrects `hospital_settings` column defaults. |

No Postgres Row-Level Security policies were added — RLS remains entirely outstanding (see §7).

## 3. API Endpoints

13 entities × the standard 5-route set (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`), gated by `<entity>.read`/`<entity>.write` permissions, all behind the global `JwtAuthGuard`/`TenantGuard` stack from Sprints 2.1–2.2. `HospitalSettings` is the exception — no list route, no soft-delete; just `GET /hospital-settings` (get-or-create) and `PATCH /hospital-settings`, since it's a singleton config row, not a collection.

`GET /audit-logs` — `audit.read` permission, paginated, `?entity=`/`?userId=`/`?from=`/`?to=` filters.

Full per-entity route table is in each controller's Swagger tag (`/api/docs`) rather than reproduced here — 13 entities × near-identical routes would just restate §1.

## 4. Architecture & Design Decisions

- **Why a generic CRUD engine instead of 13 hand-written services**: `AGENTS.md`'s reusability principle requires every CRUD surface to include search/filter/sort/pagination/soft-delete/audit-recording. Writing that 13 times would mean 13 places to fix a bug in, e.g., the unique-conflict-to-409 mapping. `MasterDataCrudService<TEntity, TCreateDto, TUpdateDto>` implements it once; a concrete service is just a constructor call wiring a Prisma delegate + `MasterDataCrudOptions` (entity name, error codes, `CrudFieldConfig`). Entities with extra invariants (`Tariff`) override the one method that needs it rather than fighting a generic mapping hook.
- **Why `master-data.controller.ts` was deleted**: it was a Sprint 1 placeholder — a single stub `@Controller("cost-centers")` with one `@Get()` throwing `501 Not Implemented`. It named exactly one of the 13 entities and could not have grown into a multi-entity controller without either dispatching on a resource-type path segment (losing per-entity DTO typing and Swagger tagging) or becoming a god-class with 13×5 handler methods. Splitting into 13 thin per-entity controllers keeps each one's route, DTO, and `@RequirePermissions` decorator scoped to a single resource, and gives each entity its own clean Swagger tag — consistent with how Sprint 2.2 already did one controller per tenancy resource (`Organization`/`Hospital`/`Branch`).
- **Why `Tariff` uses supersede + append-only instead of update-in-place**: per `docs/02_DOMAIN_MODEL.md`'s `tariffs` note, a tariff change is a financial event that must retain history (what the tariff *was* before a change, and when), not just its current value. `TariffService` therefore overrides `create()` (not the generic engine's default) to, in one transaction: (1) flip the previously-`active` row for that service to `status: "superseded"`, (2) insert a new `active` row, and (3) sync the denormalized `Service.currentTariff` pointer that the profitability engine reads. Because history must be preserved, `Tariff` has no natural `(hospitalId, code)` unique key like the other 12 entities — every write is a new row by design, not an upsert target. Sprint 3 is basic CRUD only: the caller with `tariff.write` sets a tariff directly (`approvedByUserId`/`approvedAt` = caller, now); a separate propose/approve workflow is scoped by the already-seeded `tariff.propose`/`tariff.approve` permission codes but has no implementation yet (see §7).
- **Why `HospitalSettings` is a singleton, not generic-engine CRUD**: it's one config row per hospital (`docs/24_CONFIGURATION.md`), not a collection — there's no "list hospital settings" or "delete hospital settings" operation that makes sense. `HospitalSettingsService` is hand-written (get-or-create + update) rather than extending `MasterDataCrudService`, since the generic engine's list/soft-delete surface doesn't apply and forcing it in would mean stubbing methods that should never be called.
- **Why the seed script upserts by natural key, with `Tariff` as the one exception**: `seedDemoMasterData` (`src/master-data/master-data-seed.ts`) upserts every entity on its real unique constraint — `(hospitalId, code)` for 11 entities, the compound `(costCenterId, driverId, effectivePeriod)` key for `AllocationRule` — via a shared `upsertByCode` helper, so re-running the seed against data that already exists updates in place instead of erroring or duplicating. `Tariff` has no natural key (by the append-only design above), so its seed rows are instead upserted by a fixed, hardcoded seed-only UUID (`a0000000-...-00000000N`) — the one deliberate exception, chosen so the seed script itself stays idempotent without violating the model's real "no natural key" invariant.
- **Audit interceptor sourcing**: the interceptor prefers whatever `AuditContextService.record()` captured during the request (a real before/after diff, only available for engine-backed writes) and falls back to inferring `entity`/`action` from the route path and `entityId` from the response body for anything else — chosen so audit coverage is blanket (every mutating route gets *a* row) rather than opt-in per controller, at the cost of a lower-fidelity entry for non-engine routes (e.g. auth, RBAC) until those are migrated onto the engine or given their own `record()` calls.

## 5. Test Coverage

**No new tests were added this sprint.** `npm test` reports 52 passing tests across 10 suites, unchanged from Sprint 2.2 — all of them exercise Sprint 2.1 auth and Sprint 2.2 tenancy code:

| File | Covers |
|---|---|
| `auth.service.spec.ts`, `auth.controller.spec.ts`, `token.service.spec.ts`, `password.service.spec.ts` | Sprint 2.1 auth |
| `permissions.service.spec.ts`, `permissions.guard.spec.ts`, `roles.guard.spec.ts`, `jwt-auth.guard.spec.ts` | Sprint 2.1 RBAC guards |
| `tenant.resolver.spec.ts` | Sprint 2.2 tenancy |
| `health.controller.spec.ts` | Sprint 1 health check |

Confirmed by direct search: there is no `.spec.ts` file anywhere under `src/master-data/`, `src/audit/`, or `src/common/` (the generic CRUD engine, all 13 entity services/controllers, the audit interceptor/context service, and the seed helper are all untested by anything automated). This is a materially larger gap than either prior sprint carried — Sprint 2.1 and 2.2 both shipped unit tests alongside their own new code.

## 6. Manual Verification

Everything below was actually run as part of producing this review, against the local Postgres dev container (`localhost:5433`, `hpp_dev`):

- `npm run typecheck` (`tsc --noEmit`) — exit 0, no errors.
- `npm run lint` (`eslint . --max-warnings=0`) — exit 0, no errors or warnings.
- `npm test` — 52/52 passing, 10/10 suites (see §5 for what these actually cover — nothing Sprint-3-specific).
- `npx prisma db seed` — run twice back-to-back. Both runs completed with identical output (5 cost centers, 6 profit centers, 3 drivers, 3 vendors, 5 services, 6 tariff rows incl. 1 supersede history, plus COA accounts/doctors/employees/assets/BMHP items) and no unique-constraint errors, confirming the upsert-by-natural-key design in §4 is actually idempotent, not just idempotent-by-intent.
- **Swagger live check**: booted the dev server (`npm run start:dev`) and fetched the running `GET /api/docs-json`, then confirmed the `2c73176` commit's claims actually hold in the generated schema: 13 `Paginated<Entity>ResponseDto` schemas exist in `components.schemas`; a list endpoint's `200` response (`/cost-centers` checked directly) `$ref`s its `PaginatedCostCenterResponseDto` rather than a bare array; `PATCH /cost-centers/:id` documents both `404` and `409` responses; and the `filter` query parameter on the list endpoint carries a description naming that entity's actual filterable fields (`"Filterable fields: type, status."` for cost centers). This verifies the live schema matches what the commit message claims — it is **not** a byte-for-byte diff against a captured pre-`2c73176` snapshot, since no such snapshot was taken at the time; no snapshot/fixture test exists in the repo to make that diff repeatable going forward.

**Not verified** (no automated or manual check was run for any of these):
- No actual HTTP request was made against any of the 13 entity CRUD endpoints (no live create/list/update/delete round-trip, no RBAC-permission-gating check per entity).
- No verification that `audit_logs` rows are actually written end-to-end for a real master-data mutation (the interceptor's logic was read, not exercised).
- No verification of `TariffService.create()`'s supersede transaction against real data (read, not executed).
- No load/concurrency testing of the seed script's idempotency beyond two sequential runs.

## 7. Known Limitations (Deliberately Out of Scope, or Carried Forward)

- **Zero automated tests for all of Sprint 3's own code** (§5) — the largest and newest gap. Should be the first thing addressed in Sprint 4, before more CRUD surface is built on top of the same generic engine.
- **Postgres Row-Level Security** for org/hospital scoping — still outstanding, carried from Sprint 2.1 → 2.2 → now a third sprint.
- **Audit log has no DB-level append-only enforcement.** `docs/14_SECURITY.md` §6 calls for append-only enforcement "at both application and DB-role level"; the `audit_logs` migration is a plain table with a nullable FK — no `REVOKE UPDATE/DELETE` or trigger-based protection exists yet. Application-level, nothing currently exposes an update/delete path for audit rows, but the DB-role guarantee is missing.
- **No membership management endpoints / membership-aware login** — carried from Sprint 2.2, still not addressed.
- **`scopedUnitId` (`user_hospital_memberships`) is still unenforced.** Sprint 2.2 deferred this specifically because `cost_centers`/`profit_centers` didn't exist yet; they now do, but no query in this sprint reads `scopedUnitId` to row-filter a `Kepala Unit`'s view — the unblock didn't turn into an implementation this sprint.
- **`Tariff` has no propose/approve workflow.** `tariff.propose`/`tariff.approve` permission codes exist in the catalog (seeded in Sprint 2.2), but only `tariff.write` direct-set is implemented — a caller with write access sets the tariff immediately, with no intermediate approval step.
- **No CSV import/export.** `docs/ARCHITECT_AUDIT.md`'s Sprint 3 scope lists "import/export" alongside CRUD/search/filter/sort/paginate; only the latter set was built. Every entity controller has exactly the 5 standard CRUD routes, no bulk import or export endpoint.
- **No frontend work in this review's scope.** `docs/ARCHITECT_AUDIT.md`'s Sprint 3 scope also calls for reusable `DataTable`/`FilterBar`/`EmptyState`/`GuidedTooltip` components; this sprint (and this review) is `apps/api` only.
- **`AuditInterceptor`'s route-inference fallback is lower-fidelity than engine-backed recording** for any endpoint not yet built on `MasterDataCrudService` (auth, RBAC) — no real before/after diff, just entity/action guessed from the route and `entityId` guessed from params/response body.

## 8. Lessons Learned

- Making `Tariff` override `create()` rather than adding a generic "does this entity need custom insert logic" hook to `MasterDataCrudService` kept the base class's contract simple (12 of 13 entities need nothing beyond the default) — a configurable hook would have added complexity to every entity to serve one.
- Deleting the Sprint 1 `master-data.controller.ts` outright, rather than incrementally extending it, avoided ending up with a controller that mixed the old stub route with 13 new ones under inconsistent conventions.
- Verifying the Swagger pass by booting the server and reading the live `docs-json` (§6) instead of trusting the commit message caught that the claims were in fact accurate — but also surfaced that there's no repeatable way to catch a *regression* here later, since nothing snapshots the schema. That's worth a lightweight fixture test in a future sprint if the Swagger surface keeps growing.
- The seed script's idempotency (§6) was worth verifying by actually running it twice rather than trusting the upsert-by-natural-key design on paper — cheap to check, and the one entity that breaks the pattern (`Tariff`) is exactly the kind of place a silent duplicate-row bug could otherwise hide.

## 9. Next Sprint Dependencies

Before Sprint 4 (Upload & Validation Engine, per `docs/ARCHITECT_AUDIT.md`):

- **Automated test coverage for Sprint 3's code** (§5, §7) — the generic CRUD engine underpins every future entity; a bug in it now has no test to catch a regression later. This should be treated as higher priority than new Sprint 4 feature work, not deferred alongside it.
- **Postgres Row-Level Security** — still outstanding from Sprint 2.1; now three sprints deep without it.
- **Audit log DB-level append-only enforcement** (`docs/14_SECURITY.md` §6) — not yet started.
- **Membership management endpoints + membership-aware login, and `scopedUnitId` row-filtering** — carried from Sprint 2.2; the master-data entities `Kepala Unit` scoping depends on now exist, so this is unblocked but still not done.

Any Sprint 4 work that assumes master-data CRUD is test-covered, RLS is enforced, or audit logs are tamper-proof at the DB level should not proceed until these are addressed or the assumption is explicitly documented as a known gap.
