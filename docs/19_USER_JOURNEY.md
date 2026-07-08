# 19 — User Journey

Status: Draft v1. Personas: `20_PERSONAS.md`. Onboarding step detail: `UX_ONBOARDING_GUIDE.md`. Acceptance criteria derived from these journeys: `22_ACCEPTANCE_CRITERIA.md`.

## 1. Journey — First Hospital Setup (Admin Sistem)

1. Org admin creates a new hospital (`03_MULTI_TENANT.md` §5) → onboarding wizard launches (`UX_ONBOARDING_GUIDE.md`).
2. Welcome → Hospital Profile → Cost Center Setup → Profit Center Setup → Driver Setup (steps 1-5).
3. Download Excel Template → Upload Demo or Real Data → Validation Result (steps 6-8, see `06_UPLOAD_ENGINE.md`, `07_VALIDATION_ENGINE.md`).
4. Run Calculation (step 9, see `08_COST_ALLOCATION_ENGINE.md`) → View Executive Dashboard (step 10).
5. Exit criterion: hospital has ≥1 completed `allocation_run` and the Executive Dashboard shows real (or demo) figures instead of an empty state.

## 2. Journey — Monthly Period Close (Tim Costing)

1. New period auto-created as `draft`/opened (`25_PERIOD_CLOSING.md`).
2. Upload Cost, Revenue, Driver, Medical Activity files for the period → validate each → resolve errors → confirm.
3. Trigger allocation run → monitor status (notification on completion, `16_NOTIFICATION.md`).
4. Review profitability/unit cost results → spot-check against prior period trend.
5. If correction needed: rollback the specific upload batch (`01_BUSINESS_RULES.md` §5), re-upload, recalculate (creates a new run, prior run preserved for audit).
6. Lock the period once satisfied (`25_PERIOD_CLOSING.md`) — no further uploads/edits without an explicit reopen.

## 3. Journey — Tariff Decision (CFO)

1. Opens Profitability view, filters to services with negative or below-target margin.
2. Reviews formula-based `recommended_tariff` (`10_UNIT_COST_ENGINE.md`) alongside current tariff and tariff gap.
3. Requests AI tariff recommendation for a specific service (`12_AI_ENGINE.md`) → reviews rationale + citations.
4. Approves or rejects the `ai_proposals` row (`13_AI_GOVERNANCE.md` §1) → on approval, a new `tariffs` row is created, effective next period.
5. Exit criterion: tariff change is visible in `tariffs` history and reflected in the next period's `tariff_gap` calculation.

## 4. Journey — Doctor Variance Review (Manajemen Medis)

1. Opens Doctor Analytics, selects a service with known cost variance.
2. Reviews cohort distribution (median/P25/P75/P90) and factor breakdown per doctor (`11_DOCTOR_ANALYTICS.md`).
3. Requests AI explanation for a specific outlier case → reviews non-punitive narrative + factor citations (`13_AI_GOVERNANCE.md` §4).
4. Takes the report into a clinical governance meeting — the platform's role ends at "inform," not "decide" (per `PRODUCT_BIBLE.md` §7).

## 5. Journey — Kepala Unit Monthly Check-In

1. Logs in → lands on Executive Dashboard filtered automatically to their `scoped_unit_id` (`04_RBAC.md`).
2. Reviews their unit's margin trend and allocated-cost breakdown (which cost centers/drivers contributed).
3. No access to tariff-setting, AI proposal approval, or other units' data — journey is read-only by design.

## 6. Failure/Edge Journeys (must have explicit UX per `AGENTS.md`)

- Upload with validation errors → user corrects and re-uploads (not silently discarded — `07_VALIDATION_ENGINE.md`).
- Allocation run fails (e.g., cycle detected) → user redirected to fix `allocation_rules.priority` configuration with the specific conflicting cost centers named (`08_COST_ALLOCATION_ENGINE.md` §3).
- AI unavailable → dashboard still fully functional with formula-based figures; AI panels show a graceful "temporarily unavailable" state (`12_AI_ENGINE.md` §3, `17_ERROR_HANDLING.md`).
