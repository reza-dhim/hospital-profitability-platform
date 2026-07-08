# 18 — Formula Reference

Status: Draft v1 — single-source consolidated reference. Canonical origin of every formula is `PRODUCT_BIBLE.md` §6; this document does not redefine them, it indexes where each is implemented and tested, per `AGENTS.md`'s "never hardcode business rules" principle (formulas must be traceable to one place, not scattered/duplicated across the codebase).

## 1. Formula Index

| Formula | Definition (`PRODUCT_BIBLE.md` §6) | Implemented in | Tested via |
|---|---|---|---|
| Allocated Cost | `Total Cost Center Cost × Driver Percentage` | `packages/domain/src/formulas.ts` (`allocatedCost`) | `packages/domain/src/formulas.spec.ts` |
| Driver Percentage | `driver_values(target) / SUM(driver_values(all targets))` | `packages/domain/src/formulas.ts` (`driverPercentage`) | same |
| Unit Cost | `Total Allocated Cost / Service Volume` | `packages/domain/src/formulas.ts` (`unitCost`) | same |
| Gross Profit | `Revenue − Direct Cost − Allocated Cost` | `packages/domain/src/formulas.ts` (`grossProfit`) | same |
| Margin | `Gross Profit / Revenue × 100` | `packages/domain/src/formulas.ts` (`margin`) | same |
| Tariff Gap | `Current Tariff − Unit Cost` | `packages/domain/src/formulas.ts` (`tariffGap`) | same |
| Recommended Tariff | `Unit Cost / (1 − Target Margin)` | `packages/domain/src/formulas.ts` (`recommendedTariff`) | same |
| Target Margin resolution | service → profit center → hospital default | `packages/domain/src/target-margin.ts` (`resolveTargetMargin`) | `packages/domain/src/target-margin.spec.ts` |
| Variance (period-over-period) | current − prior period equivalent | `09_PROFITABILITY_ENGINE.md` §5 — not yet implemented (Sprint 6) | — |
| Doctor Cost Variance | cross-doctor distribution of cost per case for a service | `11_DOCTOR_ANALYTICS.md` — not yet implemented (Sprint 8) | — |

The conceptual engine docs (`08_COST_ALLOCATION_ENGINE.md`, `09_PROFITABILITY_ENGINE.md`, `10_UNIT_COST_ENGINE.md`) describe *when* and *why* each formula runs; this table is the index of *where the code actually lives*. `packages/domain` is framework-free (no Prisma, no NestJS) and imported by `apps/api` only, per `docs/00_DOCUMENTATION_INDEX.md`'s package boundaries.

## 2. Single-Implementation Rule

Every formula above must have **exactly one** function implementation, in `packages/domain`, imported wherever needed (calculation engine, report generation, AI context assembly) — never re-implemented inline in a controller, a report template, or the frontend. The frontend never recomputes a financial formula; it only displays values returned by the API. This is the concrete enforcement mechanism for `AGENTS.md`'s "never hardcode business rules."

## 3. Precision & Rounding

- All currency figures are computed using `decimal.js` (`packages/domain/src/money.ts`) — a fixed-point/decimal type, never native floating point — to avoid the reconciliation drift described in `08_COST_ALLOCATION_ENGINE.md` §5. Values cross the Prisma boundary as `Decimal` (Prisma's own `Decimal` type maps directly to `decimal.js` values) so no precision is lost between the domain layer and persistence.
- Display rounding (e.g., to whole Rupiah) happens only at the presentation layer; stored and inter-service values retain full precision.

## 4. Change Control

Any change to a formula's definition must originate in `PRODUCT_BIBLE.md` first (business sign-off), then propagate to the referencing engine documents and this index in the same change set — this document's table is the audit checklist for "did we update everywhere."
