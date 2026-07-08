# 10 — Unit Cost Engine

Status: Draft v1. Formulas: `PRODUCT_BIBLE.md` §6 (Unit Cost, Tariff Gap, Recommended Tariff). Depends on `08_COST_ALLOCATION_ENGINE.md`, target margin governance in `01_BUSINESS_RULES.md` §6.

## 1. Responsibility

Compute per-service unit economics from a completed `allocation_run`: `unit_cost`, `tariff_gap`, `recommended_tariff`. Materialized as part of the same post-allocation pipeline described in `09_PROFITABILITY_ENGINE.md` §3 — either as additional columns on `profitability_results` scoped to `service_id`, or a sibling `service_unit_costs` table (implementation detail for the engineering team; this document defines the required fields and formulas, not the exact table split).

## 2. Computation

```
service_allocated_cost = allocated_cost apportioned from profit_center to service,
                          weighted by service's share of profit_center volume/revenue
                          (apportionment method: revenue-weighted, see §3)
service_direct_cost    = SUM(medical_activities.bmhp_cost + room_cost + staff_cost) for that service, period
total_service_cost     = service_allocated_cost + service_direct_cost
service_volume          = SUM(medical_activities.volume OR revenue_entries.volume) for that service, period

unit_cost               = total_service_cost / service_volume        // PRODUCT_BIBLE.md §6
tariff_gap               = current_tariff - unit_cost                  // PRODUCT_BIBLE.md §6
target_margin            = resolved per 01_BUSINESS_RULES.md §6 (service → profit_center → hospital default)
recommended_tariff        = unit_cost / (1 - target_margin)             // PRODUCT_BIBLE.md §6
```
Guard: `service_volume = 0` → `unit_cost = null`, surfaced in the UI as "No volume this period" rather than a divide-by-zero error or a misleading 0.

## 3. Apportionment Method (Profit Center Cost → Service)

A profit center's `allocated_cost` (from `08_COST_ALLOCATION_ENGINE.md`) is at the profit-center level; unit cost needs it at the service level. v1 apportionment: **revenue-weighted** — a service's share of its profit center's allocated cost equals that service's share of the profit center's total revenue in the period. This is the simplest defensible method and is explicitly named so it can be challenged/replaced (e.g., volume-weighted, or activity-based costing) without ambiguity. Any change to this method is a versioned business-rule change requiring update to this document and re-communication to Tim Costing users (it changes reported unit costs).

## 4. Tariff Recommendation Flow

- `recommended_tariff` computed here is a **calculated figure**, distinct from an **AI tariff recommendation** (`12_AI_ENGINE.md`). The formula-based figure is always available and shown on the Profitability/Unit Cost views without any AI involvement — it's deterministic finance math, not a model output.
- The AI layer may use this formula-based figure as one input among others (market context, historical elasticity) when producing its own `ai_proposals` row, per `13_AI_GOVERNANCE.md`. The UI must visually distinguish "Calculated Recommended Tariff" from "AI-Suggested Tariff" so users never confuse the two.

## 5. Read API

`GET /profitability/services` (per `API_SPEC.md`) returns unit cost fields alongside revenue/cost/margin for each service, for the latest completed run of the requested period.
