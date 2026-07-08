# 24 — Configuration

Status: Draft v1. Entity: `hospital_settings` (`02_DOMAIN_MODEL.md`). Referenced by `01_BUSINESS_RULES.md`, `03_MULTI_TENANT.md` §5, `06_UPLOAD_ENGINE.md`, `12_AI_ENGINE.md`, `13_AI_GOVERNANCE.md` §2.

## 1. Hospital-Level Settings (`hospital_settings`)

| Setting | Default | Governs |
|---|---|---|
| `allocation_method` | `step_down` | `01_BUSINESS_RULES.md` §2 |
| `default_target_margin` | 15% (placeholder, must be set during onboarding) | `01_BUSINESS_RULES.md` §6 |
| `fiscal_year_start_month` | January | `25_PERIOD_CLOSING.md` |
| `locale` | `id-ID` | `21_NON_FUNCTIONAL_REQUIREMENTS.md` §7 |
| `max_upload_file_size_mb` | 25 | `06_UPLOAD_ENGINE.md` §3 |
| `ai_enabled` | `false` (explicit opt-in required) | `13_AI_GOVERNANCE.md` §2 |
| `ai_monthly_token_budget` | null (unlimited until set) | `12_AI_ENGINE.md` §3 |
| `email_notifications_enabled` | `true` (per-user override, `16_NOTIFICATION.md` §4) | `16_NOTIFICATION.md` |

## 2. Configuration Ownership

- `System Admin` (hospital-scoped) manages all settings in this document via a Settings module UI. Changes are audit-logged (`23_AUDIT_TRAIL.md`).
- Platform-level defaults (used to seed a new hospital) are managed by platform operators, not exposed to hospital users.

## 3. "Copy Structure From Another Hospital" (Onboarding Convenience)

Referenced in `03_MULTI_TENANT.md` §5: an org-level admin creating a new hospital may choose to copy another hospital's cost centers, profit centers, drivers, COA accounts, and `hospital_settings` as a starting point. This is a one-time, point-in-time copy producing independent rows (new IDs, `hospital_id` reassigned) — no ongoing sync relationship is created between the source and the new hospital.

## 4. RBAC Seed Data

- The six default roles and their permission sets (`04_RBAC.md` §2) are seeded per new hospital from a versioned seed definition maintained in the backend codebase. This document's `04_RBAC.md` table must stay in sync with that seed; the seed is the enforced source of truth, this doc is the reviewable specification of intent.

## 5. Feature Flags

- `ai_enabled` (above) is the only MVP feature flag exposed to hospital admins. Platform-level feature flags (e.g., gradual rollout of a new module) are an engineering/ops concern documented in `29_DEPLOYMENT.md`, not a hospital-configurable setting.
