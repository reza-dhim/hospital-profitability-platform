# 38 — Dashboard Specification

Status: Draft v1 — resolves the "no chart/dashboard interaction spec" gap in `ARCHITECT_AUDIT.md`. Data source: `09_PROFITABILITY_ENGINE.md`, `10_UNIT_COST_ENGINE.md`, `11_DOCTOR_ANALYTICS.md`. Role-aware framing: `20_PERSONAS.md` §7. KPI definitions: `39_EXECUTIVE_KPI.md`.

## 1. Role-Aware Dashboard Composition

Rather than one fixed dashboard, the same underlying widgets are composed differently per role (`20_PERSONAS.md` §7):

| Widget | Direktur | CFO | Tim Costing | Kepala Unit | Manajemen Medis |
|---|---|---|---|---|---|
| Executive KPI strip (`39_EXECUTIVE_KPI.md`) | ✓ (all units) | ✓ (all units) | ✓ (all units) | ✓ (own unit only) | — |
| Revenue/Cost/Margin trend chart | ✓ | ✓ | ✓ | ✓ (own unit) | — |
| Top/Bottom profit center ranking | ✓ | ✓ | ✓ | — | — |
| Top cost center ranking | ✓ | ✓ | ✓ | ✓ (own unit) | — |
| Doctor variance summary | ✓ (aggregate) | ✓ (aggregate) | ✓ (aggregate) | — | ✓ (detail) |
| AI insight panel | ✓ | ✓ | ✓ | ✓ (scoped) | ✓ (scoped) |
| Allocation run status/history | — | ✓ | ✓ | — | — |

## 2. Drill-Down Behavior

- Clicking a profit center in any ranking/chart navigates to that profit center's detail view: its services breakdown (`10_UNIT_COST_ENGINE.md`), its allocated-cost source breakdown (which cost centers/drivers contributed, and by how much — the Step-Down chain from `08_COST_ALLOCATION_ENGINE.md` made visible).
- Clicking a trend-chart data point navigates to that period's full dashboard state (as of the run active at that point), not just a tooltip — supports the "compare this month to that spike in March" workflow.
- Clicking an `InsightCard` citation (`13_AI_GOVERNANCE.md` §3) navigates directly to the cited entity (a specific `allocation_run`, `profitability_results` row, etc.).

## 3. Chart Types (per `36_DESIGN_PRINCIPLES.md` §1 "chart tidak berlebihan")

| Data | Chart Type |
|---|---|
| Revenue/Cost/Margin trend over periods | Line chart, dual-axis only when necessary (currency vs. %) |
| Top/Bottom N ranking | Horizontal bar chart, sorted |
| Cost composition (direct vs. allocated) | Stacked bar per profit center |
| Doctor cost variance distribution | Box-plot or dot-plot showing median/P25/P75/P90 (`11_DOCTOR_ANALYTICS.md` §3) |

ECharts (`AGENTS.md` stack) implements all of the above; no chart type outside this list is introduced without updating this document first.

## 4. Filter & Period Selection

- A persistent period selector (defaulting to the most recent period with a completed run) scopes the entire dashboard — switching period re-fetches all widgets against that period's latest completed, non-stale run (`01_BUSINESS_RULES.md` §4).
- A historical-run comparison mode (select two runs for the same period, e.g., pre/post-recalculation) is available for `CFO`/`Tim Costing`/`System Admin` roles, surfacing the delta — supports the audit use case in `19_USER_JOURNEY.md` §2.

## 5. States

Every widget independently implements the four-state contract (`37_COMPONENT_LIBRARY.md` §5) — e.g., a hospital with no completed allocation run for the selected period shows the "Perhitungan belum dijalankan" empty state (`UX_ONBOARDING_GUIDE.md`) exactly where that widget would otherwise render, not a blank dashboard.
