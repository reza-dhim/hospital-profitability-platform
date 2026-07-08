# 34 — Performance Requirements

Status: Draft v1 — detailed complement to `21_NON_FUNCTIONAL_REQUIREMENTS.md` §3, scoped against the volumes in `21_NON_FUNCTIONAL_REQUIREMENTS.md` §1.

## 1. Response Time Targets

| Interaction | Target (p95) | Notes |
|---|---|---|
| Dashboard/report read (data pre-computed) | < 2s | Reads only from materialized `profitability_results`/`allocated_costs`, never live-computed (`09_PROFITABILITY_ENGINE.md` §1) |
| Master-data list (paginated, filtered) | < 500ms | |
| Upload file submission (initial accept, before async processing) | < 1s | Actual parse/validate is async (`06_UPLOAD_ENGINE.md` §2) |
| Upload validation (50,000 rows) | < 3 min | Async, user notified on completion (`16_NOTIFICATION.md`) |
| Allocation run (MVP scale hospital, `21_NON_FUNCTIONAL_REQUIREMENTS.md` §1) | < 2 min | Async, progress visible |
| AI insight/proposal generation | < 15s | Beyond this, UI shows a progress indicator, not a spinner-forever state |
| AI copilot chat first token | < 3s | Streaming response (`12_AI_ENGINE.md` §5) |
| Report PDF/Excel generation | < 30s | Async with notification on completion for larger reports |

## 2. Frontend Performance

- Largest Contentful Paint < 2.5s, Time to Interactive < 3.5s on the Executive Dashboard for a typical broadband connection — App Router server components (`ARCHITECT_AUDIT.md` recommendation) minimize client JS on data-heavy pages to hit this.
- Data tables (`37_COMPONENT_LIBRARY.md` `DataTable`) use server-side pagination/filtering, never client-side loading of full datasets, given master-data volumes in `21_NON_FUNCTIONAL_REQUIREMENTS.md` §1.

## 3. Database Performance

- Every foreign key and every column used in a `WHERE`/`ORDER BY` in a documented API filter/sort parameter (`28_OPENAPI_STRATEGY.md` §4) has a corresponding index — checked in code review, not just discovered under load.
- Partitioning on `period` (per `ARCHITECT_AUDIT.md` recommendation) for `cost_entries`, `revenue_entries`, `medical_activities`, `allocated_costs` — queries always include a period filter, so partition pruning keeps typical queries fast regardless of total historical volume.

## 4. Load Testing

- Before the MVP release (`40_PRODUCT_ROADMAP.md` Sprint 10), a load test simulating the `21_NON_FUNCTIONAL_REQUIREMENTS.md` §1 scale targets (200 concurrent users, 10 concurrent allocation runs) validates these targets are met, not just assumed from unit-level benchmarks.

## 5. Degradation Behavior

- Under load beyond target capacity, the system should degrade via increased latency and queueing (BullMQ naturally queues excess allocation/upload jobs), not via silent data loss or corrupted partial results — consistent with the transactional guarantees in `08_COST_ALLOCATION_ENGINE.md` §3 and `06_UPLOAD_ENGINE.md` §2.
