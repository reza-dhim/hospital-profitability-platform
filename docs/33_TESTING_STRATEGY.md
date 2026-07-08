# 33 — Testing Strategy

Status: Draft v1 — resolves the "no test strategy doc" gap in `ARCHITECT_AUDIT.md`. Enforces `AGENTS.md`'s per-CRUD requirements and the correctness of the engines in `08_COST_ALLOCATION_ENGINE.md`–`10_UNIT_COST_ENGINE.md`.

## 1. Test Pyramid

| Layer | Scope | Tooling (indicative) |
|---|---|---|
| Unit | Pure functions: formulas (`18_FORMULA_REFERENCE.md`), allocation algorithm, validation rules | Jest |
| Integration | NestJS module + real Postgres (test container), Prisma queries, RLS policies | Jest + Testcontainers |
| Contract | Generated OpenAPI spec vs. actual controller responses | `28_OPENAPI_STRATEGY.md` §6 |
| E2E | Full user journeys against a running stack | Playwright |
| Tenant Isolation | Dedicated suite asserting no cross-tenant leakage | Integration-layer, run on every PR touching Prisma models/RLS |

## 2. Coverage Requirements by Area

- **Cost Allocation Engine** (`08_COST_ALLOCATION_ENGINE.md`): the worked example in §4 is a mandatory fixture test; additional fixtures cover cyclic-priority rejection, missing-driver-data warning path, and reconciliation-tolerance assertion (§5).
- **Formulas** (`18_FORMULA_REFERENCE.md`): every formula has a dedicated unit test with known inputs/outputs, including edge cases (zero revenue, zero volume).
- **Master Data CRUD** (`AGENTS.md` mandate): a shared parameterized test suite runs the full CRUD + search/filter/sort/pagination/import/export/soft-delete/audit-trail contract against every master-data entity, so adding a new entity means adding it to the parameterization, not writing bespoke tests each time.
- **RBAC** (`04_RBAC.md`): every endpoint has at least one test asserting a user lacking the required permission receives 403, and one asserting `scoped_unit_id` filtering is enforced.
- **Validation Engine** (`07_VALIDATION_ENGINE.md`): one test per error code in the taxonomy.
- **AI Governance** (`13_AI_GOVERNANCE.md`): tests asserting no code path allows an `ai_proposals` row to reach `accepted` without going through the approval endpoint; tests asserting doctor-analytics language filter blocks known punitive phrasings.

## 3. Test Data

- Synthetic fixture hospital ("Rumah Sakit Contoh") with a small but complete dataset (cost centers, profit centers, drivers, a Step-Down allocation chain matching `08_COST_ALLOCATION_ENGINE.md` §4) seeded for both automated tests and `staging`/demo use (`29_DEPLOYMENT.md` §1). Never use real hospital data in non-production environments (`14_SECURITY.md`, `29_DEPLOYMENT.md` §1).

## 4. CI Gates

- PRs cannot merge with failing unit/integration/contract tests or reduced coverage below a set threshold (e.g., 80% for engine/business-logic modules; lower bar acceptable for UI-only code). E2E suite runs against `staging` post-deploy, not blocking the merge itself (to keep PR feedback fast) but blocking promotion to `production`.

## 5. Manual/Exploratory Testing

- Each new module's first release includes a manual walkthrough of its `19_USER_JOURNEY.md` entry and `22_ACCEPTANCE_CRITERIA.md` checklist before release sign-off — automated tests catch regressions, this catches UX gaps automation won't.
