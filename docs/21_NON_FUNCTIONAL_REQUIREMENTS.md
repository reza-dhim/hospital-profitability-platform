# 21 — Non-Functional Requirements

Status: Draft v1 — resolves the "no non-functional requirements" gap in `ARCHITECT_AUDIT.md`. Feeds `34_PERFORMANCE_REQUIREMENTS.md` (which details performance targets specifically) and `29_DEPLOYMENT.md`/`30_MONITORING.md`.

## 1. Scale Assumptions (baseline for design decisions across all engine docs)

| Dimension | MVP Target | Notes |
|---|---|---|
| Organizations | up to 50 | multi-tenant, shared infrastructure (`03_MULTI_TENANT.md`) |
| Hospitals per organization | up to 20 | |
| Users per hospital | up to 200 | |
| Cost/Profit centers per hospital | up to 100 each | |
| Services per hospital | up to 500 | |
| Rows per bulk upload | up to 50,000 | cap per `06_UPLOAD_ENGINE.md` §3 |
| Transactional rows per hospital per period | up to ~200,000 across all types | drives partitioning decision in `ARCHITECT_AUDIT.md` Engineering Recommendation |
| Concurrent allocation runs (platform-wide) | up to 10 simultaneous | queued via BullMQ, not all instantaneous |

These are MVP design targets, not contractual SLAs — revisit before selling to a hospital group exceeding them by an order of magnitude.

## 2. Availability

- Target uptime: 99.5% for MVP (roughly 3.5 hours/month allowed downtime) — appropriate for an internal business-intelligence tool, not a clinical life-safety system. Scheduled maintenance windows communicated in-app in advance.
- No multi-region active-active requirement for MVP; single-region deployment with standard cloud-provider availability zone redundancy.

## 3. Performance Targets (summary — full detail in `34_PERFORMANCE_REQUIREMENTS.md`)

- Dashboard page load (data already computed): p95 < 2s.
- Allocation run (typical hospital scale above): p95 < 2 minutes, async with progress feedback beyond that.
- Upload validation (50,000 rows): p95 < 3 minutes, async.

## 4. Scalability Approach

- Modular monolith (`ARCHITECT_AUDIT.md` recommendation) scales vertically first; horizontal scaling of the NestJS API tier behind a load balancer is straightforward since it's stateless (session state lives in JWT/Redis, not in-process). The Cost Allocation Engine's BullMQ workers scale independently from the API tier.
- Postgres partitioning on `period` for large transactional tables (per `ARCHITECT_AUDIT.md`) is the primary lever before considering read replicas or sharding.

## 5. Reliability

- Async pipelines (upload parsing, allocation runs, report generation) are queue-backed (BullMQ/Redis) with retry policies; a worker crash mid-job does not corrupt state because promotion/allocation writes are transactional (`06_UPLOAD_ENGINE.md`, `08_COST_ALLOCATION_ENGINE.md`).
- Backup/recovery targets: see `32_BACKUP_RECOVERY.md`.

## 6. Maintainability

- Per `AGENTS.md`: clean architecture, reusable components, TypeScript everywhere, no hardcoded business rules. This document set (`01`–`40`) is itself a maintainability control — new engineers onboard by reading these before code.

## 7. Localization

- MVP UI language: Indonesian-first (matches source docs), with English as a secondary supported language given "Enterprise AI Hospital Profitability Intelligence Platform" branding and formula/technical terms already in English. Full i18n framework requirement tracked in `35_ACCESSIBILITY.md` §5, not a hard MVP blocker.
