# 00 — Documentation Index

Status: Draft v1. This is the entry point to the `/docs` directory. It lists every document, what it's for, and the order in which a human developer or an AI coding agent should read them before touching code. Nothing in this repository should be implemented without first reading the relevant documents below — per `AGENTS.md`'s mandatory-reading rules.

## 1. How This Index Is Organized

Documents fall into two groups:
- **Origin documents** — the original product-definition set (no numeric prefix). These are the source of truth for vision, formulas, and directional intent.
- **Specification documents (01–40)** — the enterprise specification that operationalizes the origin documents into implementation-ready rules, entities, and contracts. Written in `ARCHITECT_AUDIT.md`'s numbered order, which is also a dependency order: lower numbers are foundational to higher numbers.

## 2. Origin Documents

| File | Purpose |
|---|---|
| `AGENTS.md` (repo root) | Mandatory build rules, preferred stack, and non-negotiable UX/CRUD requirements for any agent writing code in this repo. Read first, always. |
| `README.md` (repo root) | High-level product summary and staged development strategy. |
| `PRD.md` | Product Requirement Document — target users, 14 core modules, functional requirement summary, original acceptance criteria. |
| `PRODUCT_BIBLE.md` | **The canonical source of business vocabulary and formulas** (Allocated Cost, Unit Cost, Gross Profit, Margin, Tariff Gap, Recommended Tariff), the core business questions the platform must answer, and the doctor-analytics fairness principle. Every specification document below references this file and must never contradict it. |
| `DATABASE_SCHEMA.md` | Original draft schema. Extended (not replaced) by `02_DOMAIN_MODEL.md`, which adds the entities this draft was missing. |
| `API_SPEC.md` | Original draft route list. Extended (not replaced) by `28_OPENAPI_STRATEGY.md` (contract/versioning strategy) and the DTO-level detail implied throughout `06`–`13`. |
| `UX_ONBOARDING_GUIDE.md` | First-login onboarding wizard steps, product tour, empty-state and tooltip copy examples. |
| `DESIGN_SYSTEM.md` | Directional visual language ("enterprise, modern, clean") and named reusable components. Made concrete by `36_DESIGN_PRINCIPLES.md` and `37_COMPONENT_LIBRARY.md`. |
| `CODEX_TASKS.md` | Original task breakdown used to drive early scaffolding prompts (Codex). Superseded as an execution plan by `ARCHITECT_AUDIT.md` §Sprint Planning and `40_PRODUCT_ROADMAP.md`. |
| `prompts/CODEX_INITIAL_PROMPT.md` | The initial scaffolding prompt given to Codex, including the placeholder route list. Historical/reference only. |
| `ARCHITECT_AUDIT.md` | The audit that identified every gap in the origin documents (missing entities, business rules, security/AI/RBAC requirements) and proposed the 01–40 documentation set plus the Sprint 0→MVP roadmap. Read this to understand *why* each specification document below exists. |

## 3. Specification Documents (01–40)

### Foundations — read before any backend/database work
| # | File | Purpose |
|---|---|---|
| 01 | `01_BUSINESS_RULES.md` | Operating rules: allocation methodology choice, period/recalculation/rollback semantics, driver percentage source of truth, target margin governance, doctor-analytics fairness enforcement, approval workflows. |
| 02 | `02_DOMAIN_MODEL.md` | Full entity list, including every entity missing from `DATABASE_SCHEMA.md` (periods, upload staging, validation errors, AI tables, tariffs history, etc.), relationships, and cross-cutting column conventions (soft delete, audit ownership). |
| 03 | `03_MULTI_TENANT.md` | Organization → hospital → branch tenancy model and the two-layer isolation strategy (application scoping + Postgres RLS). |
| 04 | `04_RBAC.md` | Role/permission model, the default six-role permission matrix, doctor-data sensitivity gating. |
| 05 | `05_AUTHENTICATION.md` | JWT + rotating refresh token mechanism, password policy, session management, SSO extension point. |

### Core Engines — the financial/data heart of the product
| # | File | Purpose |
|---|---|---|
| 06 | `06_UPLOAD_ENGINE.md` | Two-phase (stage → confirm) bulk upload pipeline, file constraints, upload security. |
| 07 | `07_VALIDATION_ENGINE.md` | Full validation error-code taxonomy and severity model. |
| 08 | `08_COST_ALLOCATION_ENGINE.md` | Direct and Step-Down allocation algorithms, run state machine, worked numeric example (also the mandatory test fixture). |
| 09 | `09_PROFITABILITY_ENGINE.md` | Revenue/cost/margin materialization per profit center from a completed allocation run. |
| 10 | `10_UNIT_COST_ENGINE.md` | Per-service unit cost, tariff gap, and formula-based recommended tariff. |
| 11 | `11_DOCTOR_ANALYTICS.md` | Doctor/service cost variance computation and mandatory factor-attribution (never a bare number). |
| 12 | `12_AI_ENGINE.md` | AI capability list, RAG architecture over platform data, copilot chat, what-if simulation. |
| 13 | `13_AI_GOVERNANCE.md` | Hard guardrails: human-approval-only writes, data privacy boundary, explainability/citation requirement, doctor-analytics language constraints. |

### Cross-Cutting Platform Concerns
| # | File | Purpose |
|---|---|---|
| 14 | `14_SECURITY.md` | Data protection, compliance framing (UU PDP), rate limiting, application security practices. |
| 15 | `15_REPORTING.md` | Report types, generation/versioning, scheduling and delivery. |
| 16 | `16_NOTIFICATION.md` | Notification triggers, channels, data shape. |
| 17 | `17_ERROR_HANDLING.md` | Standard API error envelope, HTTP status mapping, frontend error-state rules, idempotency. |

### Reference & Product Definition
| # | File | Purpose |
|---|---|---|
| 18 | `18_FORMULA_REFERENCE.md` | Consolidated index of every formula, where it's implemented, single-implementation rule, precision/rounding standard. |
| 19 | `19_USER_JOURNEY.md` | End-to-end journeys per persona, including failure/edge-case journeys. |
| 20 | `20_PERSONAS.md` | The six user personas: goals, frequency of use, key views, RBAC implications. |
| 21 | `21_NON_FUNCTIONAL_REQUIREMENTS.md` | Scale assumptions, availability target, scalability approach, localization stance. |
| 22 | `22_ACCEPTANCE_CRITERIA.md` | Testable, checklist-form acceptance criteria per module. |

### Governance & Configuration
| # | File | Purpose |
|---|---|---|
| 23 | `23_AUDIT_TRAIL.md` | What is audited, entry shape, implementation pattern (global interceptor), integrity controls. |
| 24 | `24_CONFIGURATION.md` | `hospital_settings` catalog, configuration ownership, RBAC seed data, feature flags. |
| 25 | `25_PERIOD_CLOSING.md` | Period lifecycle state machine (draft/open/locked/closed/reopen) and its interaction with uploads and allocation runs. |
| 26 | `26_DATA_RETENTION.md` | Retention period per data category, deletion mechanics, data-subject-request handling. |
| 27 | `27_INTEGRATION.md` | MVP integration surface (Excel-first, no HIS/ERP), future integration points. |

### Engineering Operations
| # | File | Purpose |
|---|---|---|
| 28 | `28_OPENAPI_STRATEGY.md` | Code-generated OpenAPI spec as source of truth, frontend contract consumption, versioning, streaming-endpoint handling. |
| 29 | `29_DEPLOYMENT.md` | Environments, CI/CD pipeline, infrastructure shape, rollback strategy. |
| 30 | `30_MONITORING.md` | Golden signals, business-critical job monitoring, alerting thresholds. |
| 31 | `31_LOGGING.md` | Structured logging format, trace correlation, log levels, what must never be logged. |
| 32 | `32_BACKUP_RECOVERY.md` | Backup scope, RPO/RTO targets, restore testing cadence. |

### Quality & Product Surface
| # | File | Purpose |
|---|---|---|
| 33 | `33_TESTING_STRATEGY.md` | Test pyramid, coverage requirements by area, CI gates. |
| 34 | `34_PERFORMANCE_REQUIREMENTS.md` | Response-time targets per interaction, frontend/database performance rules, load testing. |
| 35 | `35_ACCESSIBILITY.md` | WCAG 2.1 AA target, concrete requirements, i18n stance. |
| 36 | `36_DESIGN_PRINCIPLES.md` | `DESIGN_SYSTEM.md`'s directional language turned into checkable rules; design tokens. |
| 37 | `37_COMPONENT_LIBRARY.md` | Every reusable component's purpose and required states. |
| 38 | `38_DASHBOARD_SPECIFICATION.md` | Role-aware dashboard composition, drill-down behavior, chart-type rules. |
| 39 | `39_EXECUTIVE_KPI.md` | Exact KPI definitions, presentation rules, AI executive summary. |
| 40 | `40_PRODUCT_ROADMAP.md` | Consolidated Phase 2 backlog, launch blockers, prioritization principle. |

## 4. Recommended Reading Order

### For a human developer joining the project
1. `AGENTS.md`, `README.md` — non-negotiable rules and stack.
2. `PRODUCT_BIBLE.md` — the business domain and formulas. Do not skip this; every other document assumes it.
3. `PRD.md` — module scope and users.
4. `ARCHITECT_AUDIT.md` — why the specification set exists and what it covers.
5. `01_BUSINESS_RULES.md` → `02_DOMAIN_MODEL.md` → `03_MULTI_TENANT.md` → `04_RBAC.md` → `05_AUTHENTICATION.md` — the foundations, in this exact order (each depends on the one before it).
6. Whichever engine document(s) (`06`–`13`) correspond to the module you're building, read alongside `18_FORMULA_REFERENCE.md` if the module touches any calculation.
7. `14_SECURITY.md`, `17_ERROR_HANDLING.md`, `23_AUDIT_TRAIL.md` — apply to every module, read once, keep as reference.
8. `20_PERSONAS.md` and `19_USER_JOURNEY.md` — before building any UI, to understand who you're building for.
9. `36_DESIGN_PRINCIPLES.md`, `37_COMPONENT_LIBRARY.md`, `38_DASHBOARD_SPECIFICATION.md` — before building any UI screen specifically.
10. Everything else (`24`–`35`, `39`, `40`) on demand, as the task touches that concern (deployment, monitoring, testing, etc.) — not required reading before Sprint 1, but required before the sprint that implements that concern.

### For an AI coding agent about to implement a specific task
Before writing any code for a given task, read **in this order**:
1. `AGENTS.md` (rules) → `PRODUCT_BIBLE.md` (domain truth) — always, regardless of task.
2. `02_DOMAIN_MODEL.md` — if the task touches any database entity, to confirm the entity's fields/relationships are current.
3. `01_BUSINESS_RULES.md` — if the task touches any calculation, period, upload, or approval logic.
4. `04_RBAC.md` — if the task exposes any new endpoint or UI action (every endpoint needs a permission check).
5. The specific engine/module document (`06`–`13`, `15`, `16`) matching the task.
6. `17_ERROR_HANDLING.md` and `28_OPENAPI_STRATEGY.md` — for the response/error shape conventions, on any new endpoint.
7. `22_ACCEPTANCE_CRITERIA.md` — the relevant checklist section, to self-verify the implementation before declaring the task done.
8. If the task is UI: `36_DESIGN_PRINCIPLES.md`, `37_COMPONENT_LIBRARY.md`, and `35_ACCESSIBILITY.md`.
9. If the task is a new AI feature: `13_AI_GOVERNANCE.md` is mandatory, not optional — no AI output may bypass its guardrails.

An agent should never implement a business rule, formula, entity, or permission it cannot point to in this documentation set. If a task requires a decision not covered here, that is a documentation gap — stop and raise it rather than inventing an undocumented rule (consistent with the Sprint 0 approach already followed in this repository).

## 5. Maintenance Rule

When a specification document changes in a way that affects another document's stated facts (e.g., a new entity added to `02_DOMAIN_MODEL.md` that a formula in `18_FORMULA_REFERENCE.md` depends on), both documents must be updated in the same change. This index's file list and one-line descriptions must be kept current whenever a document is added, renamed, or removed from `/docs`.
