# 22 — Acceptance Criteria

Status: Draft v1 — expands `PRD.md` §Acceptance Criteria into testable, per-module criteria. Cross-references the journeys in `19_USER_JOURNEY.md` and the module specs each criterion validates.

## 1. Onboarding
- [ ] A new hospital's first login always presents the onboarding wizard, never a blank dashboard (`UX_ONBOARDING_GUIDE.md`, `19_USER_JOURNEY.md` §1).
- [ ] Wizard cannot be skipped past step 4 (Profit Center Setup) without at least one cost center and one profit center existing.
- [ ] Wizard completion is resumable — closing mid-wizard and returning restarts at the last incomplete step.

## 2. Master Data
- [ ] Every master-data entity supports create/read/update/soft-delete/search/filter/sort/pagination/import/export (`AGENTS.md`), verified per entity in `33_TESTING_STRATEGY.md`.
- [ ] Deleting a cost/profit center referenced by historical `allocated_costs` soft-deletes only (hard delete blocked) — historical results remain intact and readable.

## 3. Upload & Validation
- [ ] User can download a template, upload a file, and see row-level validation results before confirming (`06_UPLOAD_ENGINE.md`, `07_VALIDATION_ENGINE.md`).
- [ ] A file with `error`-severity rows cannot be confirmed; a file with only `warning`-severity rows can be confirmed after explicit acknowledgment.
- [ ] Rollback of a confirmed batch removes its rows and marks dependent allocation runs `stale` (`01_BUSINESS_RULES.md` §5).

## 4. Cost Allocation
- [ ] Running Direct and Step-Down allocation against the worked example in `08_COST_ALLOCATION_ENGINE.md` §4 produces the documented figures exactly.
- [ ] A cyclic `allocation_rules.priority` configuration fails the run with a specific, actionable error before any calculation executes.
- [ ] Recalculation never mutates a `completed` run; it always creates a new run with `supersedes_run_id` set.

## 5. Profitability & Unit Cost
- [ ] Profit center ranking (top/bottom) reflects the latest completed, non-stale run for the selected period.
- [ ] A service with zero volume shows "No volume this period," never a divide-by-zero error or a blank/misleading value.
- [ ] `tariff_gap` and `recommended_tariff` are visible per service and match the formulas in `18_FORMULA_REFERENCE.md`.

## 6. Doctor Analytics
- [ ] A user without `doctor_analytics.read_detail` never receives a doctor name or ID in any API response, including exports.
- [ ] Every variance figure shown is accompanied by its contributing-factor breakdown (`11_DOCTOR_ANALYTICS.md` §4) — no bare numbers.
- [ ] Services/doctors with fewer than 5 cases in the period are excluded from comparison, shown as "insufficient data."

## 7. AI
- [ ] No AI output ever writes directly to `tariffs`, `target_margins`, or any master data; all business-affecting output lands in `ai_proposals` pending human approval (`13_AI_GOVERNANCE.md` §1).
- [ ] Every AI insight/proposal displays at least one citation back to underlying data, or explicitly states it has none.
- [ ] AI unavailability degrades the dashboard gracefully — all formula-based figures remain visible and correct.

## 8. RBAC & Multi-Tenancy
- [ ] A user from Hospital A can never retrieve, via any endpoint, a row belonging to Hospital B (verified by the isolation test suite, `33_TESTING_STRATEGY.md`).
- [ ] `Kepala Unit` sees only their `scoped_unit_id`'s data across all dashboard/report endpoints.

## 9. Reporting
- [ ] A generated report reflects the data as of its generation `allocation_run_id`, remaining stable even after later recalculation (`15_REPORTING.md` §2).
- [ ] Scheduled reports deliver on the configured cadence with a working, time-boxed signed download link.

## 10. Platform-Wide
- [ ] Every page implements loading, empty, error, and success states (`AGENTS.md`, `17_ERROR_HANDLING.md`).
- [ ] Every mutating action (create/update/delete/approve/lock/reopen) produces a corresponding `audit_logs` entry (`23_AUDIT_TRAIL.md`).
