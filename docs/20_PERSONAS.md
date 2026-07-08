# 20 — Personas

Status: Draft v1 — expands `PRD.md` §Target Users into working personas for design/engineering decisions. Referenced by `19_USER_JOURNEY.md`, `04_RBAC.md`, `38_DASHBOARD_SPECIFICATION.md`.

## 1. Direktur Rumah Sakit (Hospital Director)
- **Goals**: understand overall hospital financial health at a glance; make strategic calls on which services to grow/cut.
- **Frequency of use**: weekly, dashboard-only; rarely touches upload/master-data screens.
- **Key views**: Executive Dashboard (`39_EXECUTIVE_KPI.md`), Profitability trend, top/bottom profit centers.
- **RBAC**: read-heavy across most modules (`04_RBAC.md`).

## 2. CFO / Finance Director
- **Goals**: validate tariffs are cost-covering, approve AI tariff proposals, set target margins, own the numbers that go external (board reports, regulators).
- **Frequency**: weekly/monthly, deep engagement during period close.
- **Key views**: Tariff & target margin management, AI proposal approval queue (`13_AI_GOVERNANCE.md`), profitability detail, scheduled reports.
- **Pain point this product solves**: previously no systematic view of true unit cost including allocated overhead; tariff-setting was reactive/anecdotal.

## 3. Tim Costing (Costing Team)
- **Goals**: keep master data and monthly data uploads accurate; run and validate allocation calculations; the primary hands-on operator.
- **Frequency**: daily/weekly, especially around period close.
- **Key views**: Upload Center, Validation panel, Master Data CRUD, Allocation Run history.
- **Pain point solved**: manual spreadsheet-based cost allocation was error-prone and slow; this role is the platform's power user.

## 4. Kepala Unit (Unit Head)
- **Goals**: see their own department/profit center's cost and profit performance; understand what's driving their numbers.
- **Frequency**: monthly.
- **Key views**: Profitability dashboard filtered to their own unit (`04_RBAC.md` `scoped_unit_id`), no cross-unit visibility.
- **Pain point solved**: previously received cost figures without breakdown of *why* — now sees driver-based allocation detail.

## 5. Manajemen Medis (Medical Management)
- **Goals**: review doctor/procedure cost variance as a quality/efficiency conversation, not a punitive audit; identify clinical pathway improvement opportunities.
- **Frequency**: monthly/quarterly.
- **Key views**: Doctor Analytics (detail access, `04_RBAC.md` §5), factor-breakdown comparisons (`11_DOCTOR_ANALYTICS.md`).
- **Sensitivity**: this persona's primary risk is misuse of the tool as punitive — UX and AI framing are constrained accordingly (`01_BUSINESS_RULES.md` §7, `13_AI_GOVERNANCE.md` §4).

## 6. Admin Sistem (System Admin)
- **Goals**: configure the hospital's setup correctly once, then get out of the way; manage users/roles; handle period locking and exceptional operations (reopen, rollback).
- **Frequency**: heavy during onboarding, light thereafter, spikes during incident/correction handling.
- **Key views**: Settings, RBAC/user management, Period management (`25_PERIOD_CLOSING.md`), Audit Trail.

## 7. Cross-Persona Design Implication

The same dashboard data serves six very different mental models — this is why `38_DASHBOARD_SPECIFICATION.md` defines role-aware views rather than one dashboard with everything visible, and why `04_RBAC.md` scoping exists at the row level (`scoped_unit_id`), not just the module level.
