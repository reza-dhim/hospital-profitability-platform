# 39 — Executive KPI

Status: Draft v1 — resolves the "Missing Reporting Requirement" gap's dashboard-specific portion from `ARCHITECT_AUDIT.md`; defines the exact KPI set referenced generically in `PRD.md` §Dashboard ("executive KPI"). Computation source: `09_PROFITABILITY_ENGINE.md`, `10_UNIT_COST_ENGINE.md`. Displayed via `38_DASHBOARD_SPECIFICATION.md` §1 KPI strip.

## 1. KPI Definitions

| KPI | Formula / Source | Trend Comparison |
|---|---|---|
| Total Revenue | `SUM(profitability_results.revenue)`, hospital scope, latest completed run | vs. prior period, vs. same period last year |
| Total Cost | `SUM(profitability_results.total_cost)` | vs. prior period |
| Gross Profit | `SUM(profitability_results.gross_profit)` | vs. prior period |
| Overall Margin | `Total Gross Profit / Total Revenue × 100` (hospital-weighted, not an average of per-center margins) | vs. prior period, vs. `hospital_settings.default_target_margin` |
| Unallocated Cost | Sum of any cost-center pool that could not be allocated due to missing driver data (`08_COST_ALLOCATION_ENGINE.md` §5) | Should trend to zero; a persistent nonzero value is itself a data-quality signal surfaced here, not buried |
| # Services Below Target Margin | Count of `services` where `margin < target_margin` (resolved per `01_BUSINESS_RULES.md` §6) | vs. prior period |
| # Services With Recommended Tariff Increase | Count where `tariff_gap < 0` (i.e., current tariff below unit cost) | vs. prior period |
| Doctor Variance Flags | Count of doctor/service pairings beyond the P90 cohort threshold (`11_DOCTOR_ANALYTICS.md` §3), aggregate count only on this KPI strip (no names) | vs. prior period |

## 2. Presentation Rules

- Every KPI card (`MetricCard`, `37_COMPONENT_LIBRARY.md`) shows the current value, the trend delta (absolute and %), and a directional indicator that is never color-only (`35_ACCESSIBILITY.md` §2).
- KPIs respecting role scoping: a `Kepala Unit` sees the same KPI set computed against their `scoped_unit_id` only (`04_RBAC.md`), not the hospital total.

## 3. AI Executive Summary

- A narrative summary (`ai_insights` type `executive_summary`, `12_AI_ENGINE.md`) accompanies the KPI strip, generated after each allocation run completes, explaining the largest movers among the KPIs above in plain language with citations (`13_AI_GOVERNANCE.md` §3) — this is the "AI insight" line item in `PRD.md` §Dashboard, scoped specifically to this KPI set so its claims are always checkable against the numbers on the same screen.

## 4. Refresh Cadence

- KPIs recompute (materialize) automatically whenever a new `allocation_run` reaches `completed` (`09_PROFITABILITY_ENGINE.md` §3) — there is no separate "refresh KPI" action; they are always in sync with the latest completed, non-stale run for the selected period.
