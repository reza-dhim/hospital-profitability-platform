# 01 — Business Rules

Status: Draft v1 — resolves the "Missing Business Rules" gaps identified in `ARCHITECT_AUDIT.md`.
Authoritative source for domain vocabulary and formulas: `PRODUCT_BIBLE.md`. This document defines the operating rules that govern how those formulas are applied over time and across the organization hierarchy. See also `03_MULTI_TENANT.md`, `08_COST_ALLOCATION_ENGINE.md`, `25_PERIOD_CLOSING.md`.

## 1. Ownership & Scoping Rule

- Every `cost_center`, `profit_center`, `driver`, `service`, `doctor`, `coa_account`, and `tariff` belongs to exactly one `hospital`. There is no organization-wide sharing of master data across hospitals in v1 — a hospital group with 5 hospitals configures cost centers 5 times (or via the copy/template feature described in `24_CONFIGURATION.md`).
- `branch` is a physical location under a `hospital`. Cost centers and profit centers are defined at the **hospital** level, not the branch level. Transactional data (`cost_entries`, `revenue_entries`, `medical_activities`) may optionally carry a `branch_id` for multi-site hospitals, but allocation always runs at the hospital scope.
- Rationale: hospitals are legally and financially distinct cost-accounting units even within one organization/group; branches within a hospital typically share the same chart of accounts and cost-center structure. See `03_MULTI_TENANT.md` for the enforcement model.

## 2. Allocation Methodology

The Cost Allocation Engine (`08_COST_ALLOCATION_ENGINE.md`) supports two methods, selectable per `allocation_run`:

| Method | Description | v1 Support |
|---|---|---|
| Direct Allocation | Each cost center's cost is distributed straight to profit centers via its driver, with no cost center-to-cost center cost flow. | Required |
| Step-Down Allocation | Cost centers are sequenced (via `allocation_rules.priority`); a cost center allocates to *all later-sequenced cost centers and all profit centers*, but never back to an earlier-sequenced cost center. | Required |
| Reciprocal Allocation | Simultaneous-equation method allowing bidirectional cost center flows. | Out of scope for MVP — documented as a Phase 2 candidate in `40_PRODUCT_ROADMAP.md`. |

Rules:
- The sequencing order for Step-Down is defined by ascending `allocation_rules.priority` per cost center. Priority values must be unique within a hospital for a given `effective_period`. The engine rejects an allocation run if priority produces a cycle.
- A hospital declares its default method in `hospital_settings.allocation_method`; it may be overridden per `allocation_run`.
- Once a cost center's cost has been allocated in a Step-Down sequence, it cannot receive further allocated cost from a lower-priority cost center in the same run (enforced by the topological ordering, not by convention).

## 3. Driver Percentage — Source of Truth

- Driver percentages are **derived, not entered directly**. The engine computes `driver_percentage = driver_values.value (for target center) / SUM(driver_values.value) (for all target centers under that driver, same period)`.
- Manual override of a computed percentage is not permitted in v1. If a hospital needs a manual adjustment, it must be recorded as a corrected `driver_values` entry (with audit trail per `23_AUDIT_TRAIL.md`), not as an override of the computed allocation.
- If `driver_values` is missing for a target center in the period, that center receives zero allocation from that driver and a validation warning is raised (`07_VALIDATION_ENGINE.md`).

## 4. Recalculation Semantics

- `allocation_runs` are **immutable once status = `completed`**. `POST /allocation-runs/:id/recalculate` never mutates an existing run's results; it always creates a **new** `allocation_run` row referencing the same period, with `supersedes_run_id` pointing to the prior run.
- The dashboard and reports always read from the **latest completed run** for a period unless a user explicitly selects a historical run for comparison/audit purposes.
- Recalculation is only permitted for periods with status `open` (see `25_PERIOD_CLOSING.md`). Locked/closed periods require an explicit "reopen" action gated to `System Admin` (see `04_RBAC.md`), which itself is an audited event.

## 5. Upload Correction & Rollback

- Upload rollback (`POST /uploads/:id/rollback`) removes the staged/promoted rows contributed by that specific `upload_batch` from the live transactional tables, identified via `source_file_id`.
- Rollback does **not** retroactively edit or delete any `allocation_run` that already consumed that data. Instead, rollback invalidates all `allocation_runs` for the affected period(s) by marking them `stale` — they remain viewable for audit but are visually flagged, and the dashboard falls back to the latest **non-stale** run (or an empty state if none exists) with a banner prompting recalculation.
- Rollback is only permitted while the period is `open`.

## 6. Target Margin Governance

- `target_margin` used in `Recommended Tariff = Unit Cost / (1 - Target Margin)` is configured per `service` (most specific), falling back to per `profit_center`, falling back to a hospital-wide default in `hospital_settings.default_target_margin`.
- Only `CFO / Finance Director` and `System Admin` roles may set or change a target margin (see `04_RBAC.md`). Every change is audit-logged with before/after values.
- A target margin change does not retroactively alter past `profitability_results`; it takes effect from the next allocation run onward.

## 7. Doctor Analytics — Fairness Rule

Per `PRODUCT_BIBLE.md` §7, doctor cost/profitability data is a **management report, not a punitive instrument**. This is enforced structurally, not just culturally:

- Doctor-level results (`doctor_profitability_results`) are visible only to `Manajemen Medis`, `CFO / Finance Director`, `Direktur`, and `System Admin`. `Kepala Unit` and `Tim Costing` see aggregated, de-identified variance bands only (e.g., "3 doctors above the 90th percentile for this procedure") unless explicitly granted doctor-level access. Full matrix in `04_RBAC.md`.
- Every doctor-analytics view must display the contributing factors (duration, BMHP, room/staff cost — per `PRODUCT_BIBLE.md` §7) alongside the variance figure. A bare cost-variance number without context is not permitted anywhere in the UI (see `11_DOCTOR_ANALYTICS.md`).
- AI-generated doctor insights (`13_AI_GOVERNANCE.md`) must never rank or score doctors punitively; framing is restricted to explanatory language ("this case had above-average BMHP cost because...").

## 8. Approval Workflows

| Action | Approver Role(s) | Notes |
|---|---|---|
| Publish an `allocation_run` result to the dashboard | Automatic on successful `completed` status | No manual approval gate in v1; recalculation itself is the control point. |
| Accept an AI tariff recommendation into `tariffs` | `CFO / Finance Director` | AI never writes directly to `tariffs`; see `13_AI_GOVERNANCE.md`. |
| Change `target_margin` | `CFO / Finance Director`, `System Admin` | Audited. |
| Reopen a locked/closed period | `System Admin` | Audited, see `25_PERIOD_CLOSING.md`. |
| Publish a scheduled report externally | `Tim Costing` or above | See `15_REPORTING.md`. |

## 9. Period Rules

See `25_PERIOD_CLOSING.md` for the full period lifecycle (draft → open → locked → closed → reopened). Summary: uploads, master-data edits affecting a period, and allocation runs are only permitted while a period is `open`.
