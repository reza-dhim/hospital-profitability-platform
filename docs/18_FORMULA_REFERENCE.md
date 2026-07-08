# 18 — Formula Reference

Status: Draft v1 — single-source consolidated reference. Canonical origin of every formula is `PRODUCT_BIBLE.md` §6; this document does not redefine them, it indexes where each is implemented and tested, per `AGENTS.md`'s "never hardcode business rules" principle (formulas must be traceable to one place, not scattered/duplicated across the codebase).

## 1. Formula Index

| Formula | Definition (`PRODUCT_BIBLE.md` §6) | Implemented in | Tested via |
|---|---|---|---|
| Allocated Cost | `Total Cost Center Cost × Driver Percentage` | `08_COST_ALLOCATION_ENGINE.md` | `33_TESTING_STRATEGY.md` §Allocation Engine fixture |
| Driver Percentage | `driver_values(target) / SUM(driver_values(all targets))` | `01_BUSINESS_RULES.md` §3, `08_COST_ALLOCATION_ENGINE.md` | same |
| Unit Cost | `Total Allocated Cost / Service Volume` | `10_UNIT_COST_ENGINE.md` | same |
| Gross Profit | `Revenue − Direct Cost − Allocated Cost` | `09_PROFITABILITY_ENGINE.md` | same |
| Margin | `Gross Profit / Revenue × 100` | `09_PROFITABILITY_ENGINE.md` | same |
| Tariff Gap | `Current Tariff − Unit Cost` | `10_UNIT_COST_ENGINE.md` | same |
| Recommended Tariff | `Unit Cost / (1 − Target Margin)` | `10_UNIT_COST_ENGINE.md` | same |
| Variance (period-over-period) | current − prior period equivalent | `09_PROFITABILITY_ENGINE.md` §5 | same |
| Doctor Cost Variance | cross-doctor distribution of cost per case for a service | `11_DOCTOR_ANALYTICS.md` | same |

## 2. Single-Implementation Rule

Every formula above must have **exactly one** function implementation in the backend codebase (once scaffolded), imported wherever needed (calculation engine, report generation, AI context assembly) — never re-implemented inline in a controller, a report template, or the frontend. The frontend never recomputes a financial formula; it only displays values returned by the API. This is the concrete enforcement mechanism for `AGENTS.md`'s "never hardcode business rules."

## 3. Precision & Rounding

- All currency figures stored and computed in the smallest denominated unit's decimal form (e.g., Rupiah, no forced integer rounding mid-calculation) using a fixed-point/decimal type (Prisma `Decimal`), never native floating point, to avoid the reconciliation drift described in `08_COST_ALLOCATION_ENGINE.md` §5.
- Display rounding (e.g., to whole Rupiah) happens only at the presentation layer; stored and inter-service values retain full precision.

## 4. Change Control

Any change to a formula's definition must originate in `PRODUCT_BIBLE.md` first (business sign-off), then propagate to the referencing engine documents and this index in the same change set — this document's table is the audit checklist for "did we update everywhere."
