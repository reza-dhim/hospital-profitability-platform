# 09 — Profitability Engine

Status: Draft v1. Formulas: `PRODUCT_BIBLE.md` §6 (Gross Profit, Margin). Depends on `08_COST_ALLOCATION_ENGINE.md` output. Feeds `38_DASHBOARD_SPECIFICATION.md`, `39_EXECUTIVE_KPI.md`.

## 1. Responsibility

Materialize `profitability_results` for every profit center, for a completed `allocation_run`, by combining `allocated_costs` with `revenue_entries` and direct costs. This is a derived/materialized step, computed automatically and immediately after an `allocation_run` reaches `completed` — never computed live per dashboard request (per `ARCHITECT_AUDIT.md` recommendation: dashboard reads must be fast and point-in-time stable).

## 2. Computation

For each `profit_center` in the run's hospital/period:
```
revenue        = SUM(revenue_entries.revenue) for that profit_center, period
direct_cost    = SUM(cost_entries.nominal) directly tagged to that profit_center (cost centers with type='direct', see note below), period
allocated_cost = SUM(allocated_costs.amount) where target = profit_center, this allocation_run
total_cost     = direct_cost + allocated_cost
gross_profit   = revenue - total_cost                     // per PRODUCT_BIBLE.md §6
margin         = gross_profit / revenue × 100              // guard: revenue = 0 → margin = null, not divide-by-zero
```
Note: `cost_centers.type` (already in `DATABASE_SCHEMA.md`) distinguishes cost centers that only ever allocate out (`indirect`) from costs directly incurred by a profit center itself (`direct`, e.g., a lab's own reagent cost) — direct-cost cost centers still flow through the same `cost_entries` table but are excluded from the allocation graph in `08_COST_ALLOCATION_ENGINE.md` and instead summed straight into `direct_cost` here.

## 3. Trigger & Consistency

- A BullMQ job listens for `allocation_run.completed` and computes `profitability_results` (and `doctor_profitability_results`, `11_DOCTOR_ANALYTICS.md`) as the next stage of the same pipeline, writing with `allocation_run_id` as the foreign key — so results are always traceable to exactly one run and never mixed across runs.
- If profitability computation itself fails after a successful allocation run, the run's overall status surfaces as `completed_with_errors` (extension to the state machine in `08_COST_ALLOCATION_ENGINE.md` §3) — the allocation numbers are valid and preserved, but the dashboard shows an explicit error state rather than partial/stale profitability figures.

## 4. Ranking & Trend Queries

- **Top/Bottom Profit Center** (`PRD.md` §Dashboard): ranks `profitability_results` by `margin` (or `gross_profit`, user-toggleable) for the latest completed run of the selected period.
- **Trend**: a time series across periods' latest-completed-run `profitability_results`, one point per period. If a period has no completed run, that point is omitted (not interpolated/zero-filled) and the chart shows a gap, per `38_DASHBOARD_SPECIFICATION.md`.

## 5. Variance

`variance` (mentioned in `PRD.md` §Calculation) = current period's `total_cost` (or `unit_cost`, see `10_UNIT_COST_ENGINE.md`) minus the trailing-period or budgeted equivalent, expressed both as absolute and percentage. Budget/standard-cost baselines are out of scope for MVP (no `budgets` entity exists yet) — v1 variance is period-over-period only; standard-cost variance is a `40_PRODUCT_ROADMAP.md` candidate.

## 6. Read API Shape

`GET /profitability/summary`, `/profit-centers`, `/services`, `/trends` (per `API_SPEC.md`) all read exclusively from `profitability_results` (never recompute), scoped to the latest completed, non-stale run for the requested period (per `01_BUSINESS_RULES.md` §4-5) unless a specific `allocationRunId` query param is supplied for historical/audit comparison.
