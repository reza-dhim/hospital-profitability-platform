# Architect Audit — Hospital Profitability Platform

Audit performed by reading, in order: AGENTS.md, README.md, all files in /docs, all files in /prompts. No code or other repository files were modified as part of this audit.

---

# Product Understanding

**Product Vision**
An enterprise AI platform that helps hospitals understand true service-line profitability by allocating non-revenue-generating (cost center) costs across revenue-generating (profit center) units — enabling data-driven decisions on tariffs, revenue targets, cost efficiency, and doctor performance.

**Business Objective**
Take all cost-center spend (HRD, IT, Laundry, CSSD, etc.), distribute it to profit centers (Rawat Jalan, ICU, IGD, Lab, etc.) via driver-based allocation, then answer: is each service still profitable, does its tariff need adjusting, does it need a revenue target, or does it need cost efficiency work.

**Main Users** (from PRD.md)
- Direktur Rumah Sakit (Hospital Director) — executive oversight
- CFO / Finance Director — financial strategy, tariff decisions
- Tim Costing (Costing Team) — data entry, allocation runs, validation
- Kepala Unit (Unit Heads) — department-level cost/profit visibility
- Manajemen Medis (Medical Management) — doctor/clinical performance review
- Admin Sistem (System Admin) — master data, RBAC, configuration

**Core Modules** (from PRD.md + AGENTS.md, 14 modules)
1. Authentication & RBAC
2. Hospital & Branch Management
3. Master Data (Cost Center, Profit Center, COA, Driver, Service, Doctor, Employee, Asset, Tariff, Vendor, BMHP)
4. Bulk Upload (Excel templates)
5. Validation Engine
6. Cost Allocation Engine (step-down + driver-based)
7. Unit Cost Engine
8. Profitability Engine
9. Tariff Recommendation
10. Doctor Analytics (cost variance by doctor/procedure)
11. Executive Dashboard
12. AI Copilot (RAG-based decision support)
13. Reporting (PDF/Excel export)
14. Audit Trail

Formulas are explicitly defined (PRODUCT_BIBLE.md §6): Allocated Cost, Unit Cost, Gross Profit, Margin, Tariff Gap, Recommended Tariff.

---

# Architecture Review

**Overall assessment: the documentation is a strong conceptual/product-vision draft, but is not sufficient to start enterprise-grade engineering.** It reads like a PRD + wireframe-of-intent, not a build spec. Every doc says "draft." Nothing defines multi-tenancy, versioning, concurrency, or failure semantics. There is currently **zero code** in `frontend/` or `backend/` — both are stub READMEs only, so this is a greenfield build.

## Missing Documentation
- No system architecture diagram (service boundaries, data flow, queue topology)
- No non-functional requirements (SLA, uptime, performance targets, data volume assumptions — e.g. how many rows per bulk upload, how many hospitals/branches at scale)
- No environment/deployment doc (dev/staging/prod, CI/CD, infra-as-code, hosting target)
- No data retention / archival policy (how long are periods/allocation runs kept)
- No versioning strategy for the API (`/api/v1` implies more will come — no deprecation policy)
- No glossary reconciling Indonesian/English terms used inconsistently across docs (BMHP, COA, driver, etc.) for engineering vs. business audiences
- No test strategy doc (unit/integration/e2e coverage expectations, given AGENTS.md mandates "every CRUD must include..." a long list)

## Missing Business Rules
- **Multi-tenancy model undefined**: `organizations` → `hospitals` → `branches` exists in schema, but no rule on whether cost centers/profit centers are scoped per-hospital, per-branch, or shared across an org. This is foundational and blocks schema finalization.
- **Allocation methodology unspecified**: PRD mentions "step-down allocation" (CODEX_TASKS.md) but PRODUCT_BIBLE only gives flat `Allocated Cost = Total × Driver%`. Step-down, direct, and reciprocal allocation are different algorithms with different cost-center-to-cost-center dependency ordering — which one(s) must the engine support, and how are cost centers sequenced?
- **Period/fiscal calendar rules**: no definition of period locking, re-open policy, or what happens when a bulk upload lands after a period's allocation run has already executed
- **Recalculation semantics**: `POST /allocation-runs/:id/recalculate` exists, but no rule on whether recalculation versions results, overwrites them, or requires approval
- **Upload correction/rollback rules**: `POST /uploads/:id/rollback` exists but no business rule on what "rollback" does to already-computed allocation runs that consumed that data
- **Driver percentage source of truth**: are driver percentages computed automatically from `driver_values`, or manually entered/overridden? No conflict-resolution rule.
- **Target margin governance**: `Recommended Tariff` formula depends on "Target Margin" — no rule on who sets it, at what level (hospital/service/profit-center), or how it's approved
- **Doctor analytics fairness/anonymization rule**: PRODUCT_BIBLE explicitly says doctor insight must be "raport, bukan alat menghukum" (a report, not a punitive tool) — this is a real compliance/culture constraint with no enforcement mechanism defined (who can see doctor-level data, is it anonymized in aggregate views, etc.) — ties directly into RBAC.
- **Approval workflow**: no mention of who approves an allocation run, a tariff recommendation, or a report before it's considered final/published

## Missing Database Entities
- `periods` (fiscal period master — referenced everywhere as `period` string/field but never modeled as an entity with open/closed status)
- `bmhp_items` / `assets` / `employees` / `vendors` / `tariffs` — these are named in PRD.md master data list and in bulk-upload list, but have **no table** in DATABASE_SCHEMA.md
- `upload_batches`/`source_files` (referenced by `source_file_id` FK in `cost_entries`/`revenue_entries` but the table itself is never defined)
- `validation_errors` (an Upload/Validation Engine needs a persisted error table for the "validation preview" API to read from — `GET /uploads/:id/validation` has no backing entity)
- `ai_insights` / `ai_conversations` (AI Copilot chat and generated insights need persistence for history/audit — none defined)
- `notifications` (onboarding, product tour, and alerts imply some notification model)
- `refresh_tokens` / `sessions` (auth module needs session/token storage — `users` table has no auth-session concept)
- `hospital_settings` / `target_margins` (target margin used in tariff formula has no home)
- `report_schedules` (CODEX_TASKS.md mentions "scheduled report placeholder" — no entity)
- No `deleted_at` / soft-delete columns anywhere despite AGENTS.md mandating soft delete on every CRUD entity
- No `created_by`/`updated_by` audit columns on most tables (only `audit_logs` exists as a side table, which is good, but base tables lack ownership tracking)

## Missing API Specification
- No request/response body schemas (pure route list — no field-level contracts, no Zod/DTO shapes)
- No pagination/filter/sort query parameter contract, despite AGENTS.md mandating pagination+filter+sort on every CRUD (the API_SPEC list doesn't show `?page=&limit=&sort=&filter=`)
- No import/export endpoints for master data CRUD (AGENTS.md mandates import/export per CRUD; API_SPEC only has upload/template endpoints for transactional bulk data, not master data)
- No error response format / error code taxonomy
- No auth error handling (401/403 semantics), token refresh endpoint, or password reset flow
- No RBAC-aware endpoint documentation (which roles can call which endpoints)
- No webhook/async job status endpoints for long-running allocation runs (calculation could take time — is `POST /allocation-runs` synchronous or does it need a polling/status endpoint beyond `GET /allocation-runs/:id`?)
- No file upload constraints (max size, accepted formats, chunking for large Excel files)
- AI endpoints (`POST /ai/*`) have no defined request/response shape, no streaming spec for `copilot/chat` despite chat being inherently streaming UX

## Missing UX Specification
- No wireframes/mockups/Figma reference — only prose "feel" (Stripe/Linear/Vercel references) with no actual layout spec
- No responsive/mobile behavior definition (is this desktop-only enterprise tool, or must it work on tablet for Kepala Unit walking the floor?)
- No data-table interaction spec (bulk actions, row selection, inline edit vs. modal edit)
- No chart/dashboard interaction spec beyond "ECharts" and "ranking/trends" — no spec for drill-down behavior (e.g., click a profit center → what view?)
- No accessibility (WCAG) requirement stated despite "enterprise-grade" claim
- No internationalization requirement — docs mix Indonesian and English; unclear if UI itself must support both languages or just be Indonesian-first
- No error-message content spec (only generic "error state" mandated, no copy guidelines)
- Design system lists component names only — no tokens (colors, spacing scale, typography scale, dark mode)

## Missing Security Requirement
- No authentication mechanism specified (JWT? session cookie? SSO/SAML for enterprise hospital IT?) — just `POST /auth/login`
- No password policy, MFA requirement, or account lockout policy
- No data encryption requirement (at-rest, in-transit) — critical since this touches doctor performance and financial data
- No PII/health-data compliance framing (Indonesia's UU PDP — Personal Data Protection Law — should be explicitly addressed given doctor/employee personal data and hospital financials)
- No rate limiting / API abuse prevention requirement
- No file upload security (virus scan, MIME validation, formula-injection protection for Excel uploads — a real risk vector for XLSX ingestion)
- No secrets management strategy (env vars vs. vault)
- No tenant isolation security model (row-level security in Postgres? app-layer scoping?) given multi-tenant `organization_id`/`hospital_id` structure
- No audit-log integrity requirement (append-only? tamper-evident?) despite audit trail being a mandatory feature

## Missing AI Requirement
- No grounding/data-access spec for RAG — what does pgvector index (documents? historical allocation runs? both?), and how is hallucination/accuracy risk managed for financial recommendations
- No guardrails for AI tariff recommendations — since these could directly influence patient-facing pricing, there's no human-in-the-loop approval requirement stated
- No cost/token budget or model-selection strategy (which OpenAI model, cost ceiling per org)
- No explainability requirement — PRODUCT_BIBLE says AI should "menjelaskan penyebab profit turun" (explain why profit dropped), but no spec on how explanations must cite underlying data (critical for CFO trust)
- No data privacy boundary for AI — does hospital financial/doctor data leave the org's environment when sent to OpenAI API? No mention of data processing agreement or on-prem/private model option
- No conversation history / context window management spec for copilot chat
- No feedback loop (thumbs up/down, correction capture) to improve/validate AI outputs over time

## Missing Reporting Requirement
- No report template spec (what exact sections/branding go into "executive PDF" vs "profitability Excel")
- No scheduling spec despite `report_schedules` being implied by CODEX_TASKS ("scheduled report placeholder") — frequency, recipients, delivery channel (email?) all undefined
- No report versioning/history (can a user re-download a report generated last month with the data as it was then?)
- No white-label/multi-hospital-branding requirement (relevant if this platform serves multiple hospital groups)

## Missing RBAC Requirement
- `roles`/`permissions`/`role_permissions` tables exist, but **no actual role definitions** — PRD lists 6 user types but never maps them to permissions
- No row-level/entity-level scoping rule (e.g., can a Kepala Unit only see their own profit center's data, or all of them?)
- No definition of default roles vs. custom roles (can hospitals create their own roles, or is it a fixed enum?)
- No specification of which modules/actions are restricted per role, especially sensitive ones: doctor-level cost variance (culturally sensitive per PRODUCT_BIBLE §7), tariff-setting, and AI copilot access
- No cross-branch/cross-hospital access rule for multi-branch orgs (can a Direktur at the org level see all branches; can a branch-level user see only their branch?)

---

# Documentation Gap Analysis

## Critical (blocks starting backend/database work)
1. Define multi-tenancy scoping rules (org → hospital → branch → cost/profit center ownership)
2. Finalize allocation methodology (step-down vs. driver-based vs. both) with worked numeric example
3. Model missing entities: `periods`, `bmhp_items`, `assets`, `employees`, `vendors`, `tariffs`, `upload_batches`, `validation_errors`
4. Define RBAC role-to-permission matrix for the 6 named user types
5. Define authentication mechanism (JWT/session/SSO) and multi-tenant security model (RLS vs. app-layer)
6. Define period locking / recalculation / rollback business rules
7. Specify AI data-privacy boundary (what hospital data is sent to OpenAI, and under what agreement)

## High (blocks API/frontend contract work)
8. Add request/response DTOs to API_SPEC.md for every endpoint
9. Add pagination/filter/sort/import/export query contracts (AGENTS.md mandates them; API_SPEC doesn't show them)
10. Define file upload constraints and validation-engine error taxonomy (persisted `validation_errors` shape)
11. Define approval workflow for allocation runs, tariff recommendations, and target margins
12. Define doctor-analytics access/anonymization rule (direct compliance implication)
13. Specify error-response format and HTTP error taxonomy across the API

## Medium (needed before UI build, but not blocking backend start)
14. Produce wireframes or a component-level layout spec (beyond named components in DESIGN_SYSTEM.md)
15. Define design tokens (color/spacing/typography scale, dark mode)
16. Define chart drill-down/interaction behavior
17. Define report template content spec (executive PDF / profitability Excel exact sections)
18. Define AI copilot conversation/context spec and streaming UX

## Nice to Have
19. Accessibility (WCAG) target
20. i18n requirement (ID/EN)
21. Report scheduling delivery channel spec
22. White-label/multi-brand support
23. System architecture diagram for onboarding new engineers

---

# Engineering Recommendation

**Next.js (frontend)**
Use the App Router with server components for data-fetching pages (dashboard, reports) and client components for interactive pieces (upload dropzone, wizard stepper, AI chat). Why: the doc set explicitly requires SSR-friendly enterprise dashboards with fast perceived load (Stripe/Linear-like feel) and heavy tabular/chart data — App Router's streaming + server components reduce client JS for data-heavy pages while keeping the interactive upload/validation/chat flows as client islands.

**NestJS (backend)**
Structure as modular monolith (not microservices) organized by bounded context matching the 14 PRD modules (AuthModule, MasterDataModule, UploadModule, AllocationModule, ProfitabilityModule, DoctorAnalyticsModule, AiModule, ReportingModule, AuditModule). Why: team size/stage doesn't justify microservices overhead yet; NestJS's module system gives clean bounded-context separation now with an extraction path later (e.g., pulling AllocationModule into its own service once calculation volume demands it). Use Nest's built-in Guards for RBAC enforcement at the controller level, and Interceptors for the mandatory audit-trail logging (satisfies AGENTS.md's blanket audit requirement without repeating logic per-module).

**PostgreSQL**
Single Postgres instance with **row-level security (RLS)** keyed on `organization_id`/`hospital_id`, not purely app-layer scoping. Why: this is a multi-tenant enterprise product handling sensitive financial and doctor-performance data — RLS gives defense-in-depth so a bug in one module's WHERE clause can't leak cross-tenant data, which matters more here than in a typical SaaS given the compliance sensitivity called out in PRODUCT_BIBLE.md §7. Use native partitioning on `period` for the large transactional tables (`cost_entries`, `revenue_entries`, `medical_activities`, `allocated_costs`) since these grow unbounded and are always queried period-scoped.

**Prisma**
Use Prisma as the primary ORM/migration tool, but drop to raw SQL (`$queryRaw`) inside the Cost Allocation Engine specifically. Why: Prisma's schema-as-code + migration workflow is the right fit for the CRUD-heavy master-data and RBAC modules (matches AGENTS.md's mandate for consistent, typed models), but step-down/reciprocal allocation algorithms involve iterative, set-based, and potentially recursive (CTE) computation across cost-center graphs that Prisma's query builder handles poorly — that engine should be hand-written SQL or a dedicated computation module reading raw data via Prisma then computing in-memory/TypeScript, with results written back via Prisma.

**AI**
Treat AI as a strictly **read-only, explain-and-recommend** layer, never a silent writer. Why: PRODUCT_BIBLE explicitly frames doctor insight as non-punitive and tariff recommendations as advisory — every AI output (tariff rec, anomaly explanation, what-if) should be persisted as a proposal record requiring human approval before it affects `tariffs` or is presented as fact, with citations back to the source `allocation_run`/`profitability_results` rows it used (RAG grounded in the platform's own computed data via pgvector, not just general knowledge). This also directly addresses the missing "AI explainability" gap above.

**Upload Engine**
Two-phase upload: (1) parse + stage into a `upload_batches`/staging table with per-row `validation_errors`, never touching live `cost_entries`/`revenue_entries` directly; (2) explicit `POST /uploads/:id/confirm` promotes staged rows to live tables inside a transaction. Why: this is exactly what the API_SPEC already implies (`validation` then `confirm` then `rollback` endpoints) — the missing piece is that the schema currently has no staging table to back it. Use a queue (BullMQ, already in stack) for parsing large Excel files asynchronously so upload doesn't block the request thread, with a job-status endpoint for the frontend to poll.

**Cost Allocation Engine**
Model cost centers as a directed graph (for step-down allocation ordering) and implement as a dedicated service/module with: (1) a deterministic sequencing step (topological sort of cost-center dependencies), (2) a pure calculation function per method (direct, step-down, reciprocal) that's unit-testable in isolation from the DB, (3) an `allocation_runs` state machine (draft → running → completed/failed) so partial failures are recoverable and re-run behavior is explicit. Why: this is the financial core of the product — it must be independently testable with known numeric fixtures (from PRODUCT_BIBLE.md §6 formulas) before it's trusted with real hospital data, and the "which allocation method" gap above must be resolved before this module can be built at all.

**Profitability Engine**
Build as a derived/materialized layer that reads `allocated_costs` + `revenue_entries` and computes `profitability_results` — triggered at the end of a successful allocation run, not computed on-the-fly per dashboard request. Why: the dashboard needs to be fast (enterprise UX expectation) and profitability figures need to be point-in-time stable/auditable for a given allocation run (a CFO must be able to say "this was the margin as calculated on run #47"), which rules out computing margins live from raw transactional data on every page load.

---

# Sprint Planning (Sprint 0 → MVP)

**Sprint 0 — Foundations & Spec Closure (no feature code)**
- Resolve all "Critical" gap-analysis items above (multi-tenancy model, allocation methodology, missing entities, RBAC matrix, auth mechanism, AI data-privacy boundary)
- Finalize ERD reflecting missing entities
- Finalize API contracts (DTOs) for Sprint 1-2 scope only (don't boil the ocean)
- Set up monorepo tooling, CI, linting, environment config

**Sprint 1 — Platform Skeleton**
- Next.js app shell (Sidebar, Topbar, PageHeader, theme, routing for all 9 placeholder pages)
- NestJS skeleton (config module, health check, Prisma connection, base module structure)
- Postgres schema v1 migration (org/hospital/branch/users/roles/permissions + missing entities added)
- CI pipeline (lint, typecheck, test on PR)

**Sprint 2 — Auth & RBAC**
- Auth module (login/logout/me, session/JWT strategy per Sprint 0 decision)
- RBAC guards + role-permission seed matrix for the 6 user types
- Row-level security policies in Postgres for org/hospital scoping
- Audit trail interceptor wired globally

**Sprint 3 — Master Data**
- Full CRUD (create/read/update/delete/soft-delete/search/filter/sort/paginate/import/export) for: Cost Center, Profit Center, Driver, COA, Doctor, Service
- Reusable DataTable, FilterBar, EmptyState, GuidedTooltip components built once, reused everywhere
- Remaining master data entities (Employee, Asset, Vendor, BMHP, Tariff) — schema + basic CRUD

**Sprint 4 — Upload & Validation Engine**
- Template generation/download per data type
- Staging-table upload pipeline (async via BullMQ)
- Validation rule engine (per PRD.md validation list) writing to `validation_errors`
- Validation preview UI + confirm/rollback flow

**Sprint 5 — Cost Allocation Engine**
- Cost-center dependency graph + topological sort
- Allocation calculation (method per Sprint 0 decision) with unit tests against PRODUCT_BIBLE formulas
- `allocation_runs` state machine + run history UI

**Sprint 6 — Unit Cost & Profitability Engine**
- Unit cost / gross profit / margin / tariff gap computation from allocation run output
- `profitability_results` materialization
- Profitability dashboard (summary, by profit center, by service, trends) with ranking

**Sprint 7 — Onboarding & Executive Dashboard Polish**
- Onboarding wizard (10 steps per UX_ONBOARDING_GUIDE.md)
- Product tour / spotlight overlay
- Executive KPI dashboard (revenue/cost/margin trend, top/bottom profit centers)

**Sprint 8 — Doctor Analytics**
- Doctor/service cost comparison, variance calculation (BMHP, duration, staff cost)
- Doctor analytics UI framed as report/insight (non-punitive per PRODUCT_BIBLE §7) with RBAC-gated access

**Sprint 9 — AI Layer (v1)**
- pgvector setup, RAG grounding on computed platform data (allocation runs, profitability results)
- Tariff recommendation + anomaly explanation endpoints, proposal-record pattern (human approval required)
- Copilot chat (streaming) scoped read-only over the org's own data

**Sprint 10 — Reporting & MVP Hardening**
- PDF/Excel export (executive, profitability, doctor analytics)
- Full audit trail UI (AuditTimeline component)
- Security pass (rate limiting, upload file validation/scanning, pen-test-readiness review)
- MVP release candidate

---

No code was written and no other repository file was modified as part of this audit. Awaiting approval before any implementation begins.
</content>
