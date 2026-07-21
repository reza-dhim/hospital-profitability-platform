# 02 — Domain Model

Status: Draft v1 — extends `DATABASE_SCHEMA.md` with the entities flagged missing in `ARCHITECT_AUDIT.md`. Business meaning of each entity follows `PRODUCT_BIBLE.md`. Scoping rules follow `01_BUSINESS_RULES.md` and `03_MULTI_TENANT.md`.

This document is the entity-relationship reference. It does not restate columns already fully specified in `DATABASE_SCHEMA.md`; it (a) adds entities that were missing, and (b) states relationships and lifecycle notes `DATABASE_SCHEMA.md` does not cover.

## 1. Entity Groups

```
Tenancy        : organizations, hospitals, branches
Identity        : users, roles, permissions, role_permissions, refresh_tokens
Master Data     : cost_centers, profit_centers, drivers, allocation_rules,
                  coa_accounts, doctors, services, employees, assets,
                  vendors, bmhp_items, tariffs
Configuration   : hospital_settings, target_margins, periods
Transactional   : cost_entries, revenue_entries, driver_values,
                  medical_activities
Upload Pipeline : upload_batches, upload_rows_staging, validation_errors
Calculation     : allocation_runs, allocated_costs, profitability_results,
                  service_unit_costs, doctor_profitability_results
AI              : ai_conversations, ai_messages, ai_insights, ai_proposals
Reporting       : report_schedules, report_exports
Platform        : audit_logs, notifications
```

## 2. New Entities (not present in `DATABASE_SCHEMA.md`)

### periods
Fiscal period master — every transactional and calculation table references `period`, but the concept must be a governed entity, not a free string.
- `id`, `hospital_id`, `label` (e.g. "2026-06"), `start_date`, `end_date`, `status` (`draft`\|`open`\|`locked`\|`closed`), `locked_at`, `closed_at`, `reopened_at`, `created_at`
- See `25_PERIOD_CLOSING.md` for lifecycle rules.

### employees
- `id`, `hospital_id`, `code`, `name`, `role_title`, `department_cost_center_id`, `employment_type`, `status`, `deleted_at`

### assets
- `id`, `hospital_id`, `code`, `name`, `category`, `cost_center_id`, `acquisition_cost`, `depreciation_method`, `useful_life_months`, `status`, `deleted_at`

### vendors
- `id`, `hospital_id`, `code`, `name`, `category`, `status`, `deleted_at`

### bmhp_items
(Bahan Medis Habis Pakai — consumable medical materials)
- `id`, `hospital_id`, `code`, `name`, `unit`, `standard_cost`, `vendor_id`, `status`, `deleted_at`

### tariffs
- `id`, `hospital_id`, `service_id`, `current_tariff`, `recommended_tariff`, `effective_date`, `approved_by_user_id`, `approved_at`, `status` (`active`\|`superseded`), `deleted_at`
- A new row is inserted on every tariff change (append-only history); `services.current_tariff` is a denormalized pointer to the active row for read performance.

### hospital_settings
- `id`, `hospital_id`, `allocation_method` (`direct`\|`step_down`), `default_target_margin`, `fiscal_year_start_month`, `locale`, `created_at`, `updated_at`

### target_margins
- `id`, `hospital_id`, `scope_type` (`hospital`\|`profit_center`\|`service`), `scope_id` (nullable for hospital scope), `target_margin`, `effective_period_id`, `set_by_user_id`, `created_at`
- Resolution order when computing Recommended Tariff: `service` row → `profit_center` row → `hospital_settings.default_target_margin`.

### upload_batches
- `id`, `hospital_id`, `type` (`cost`\|`revenue`\|`driver`\|`asset`\|`employee`\|`medical_activity`\|`bmhp`\|`tariff`), `period_id`, `file_name`, `file_url`, `uploaded_by_user_id`, `status` (`staged`\|`validating`\|`validated`\|`confirmed`\|`rolled_back`\|`failed`), `row_count`, `error_count`, `created_at`, `confirmed_at`, `rolled_back_at`
- Replaces the implicit `source_file_id` referenced (but never defined) in `DATABASE_SCHEMA.md`. `cost_entries.source_file_id` etc. now formally reference `upload_batches.id`.

### upload_rows_staging
- `id`, `upload_batch_id`, `row_number`, `raw_json`, `status` (`valid`\|`invalid`\|`promoted`), `created_at`
- Holds parsed rows before promotion to live tables. Never queried by dashboards.

### validation_errors
- `id`, `upload_batch_id`, `row_number`, `column_name`, `error_code`, `message`, `severity` (`error`\|`warning`), `created_at`
- Backs `GET /uploads/:id/validation`. See `07_VALIDATION_ENGINE.md` for the error-code taxonomy.

### service_unit_costs
- `id`, `allocation_run_id`, `service_id`, `service_allocated_cost`, `service_direct_cost`, `service_volume`, `unit_cost` (nullable — null when `service_volume` = 0), `current_tariff` (nullable), `tariff_gap` (nullable), `target_margin_used`, `recommended_tariff` (nullable), `created_at`
- One row per service per allocation run — Sprint 6, backs `GET /profitability/services`. See `10_UNIT_COST_ENGINE.md` for the unit-cost/tariff-gap/recommended-tariff formulas. A sibling table to `profitability_results` (per-profit-center) at the per-service grain, written once when an allocation run's profitability is computed, never updated in place.

### ai_conversations / ai_messages
- `ai_conversations`: `id`, `hospital_id`, `user_id`, `title`, `created_at`, `archived_at`
- `ai_messages`: `id`, `conversation_id`, `role` (`user`\|`assistant`), `content`, `citations_json`, `created_at`

### ai_insights
- `id`, `hospital_id`, `allocation_run_id` (nullable), `type` (`profit_drop_explanation`\|`anomaly`\|`doctor_variance`\|`executive_summary`), `content`, `citations_json`, `generated_at`

### ai_proposals
- `id`, `hospital_id`, `type` (`tariff_recommendation`\|`target_revenue`), `service_id`, `proposed_value`, `rationale`, `citations_json`, `status` (`pending`\|`accepted`\|`rejected`), `reviewed_by_user_id`, `reviewed_at`, `created_at`
- See `13_AI_GOVERNANCE.md` — this is the mandatory human-approval gate between AI output and any write to `tariffs`/`target_margins`.

### report_schedules
- `id`, `hospital_id`, `report_type`, `frequency` (`weekly`\|`monthly`\|`quarterly`), `recipients_json`, `format` (`pdf`\|`excel`), `created_by_user_id`, `active`, `created_at`

### report_exports
- `id`, `hospital_id`, `report_type`, `generated_for_period_id`, `file_url`, `generated_by_user_id` (nullable if scheduled), `generated_at`
- Every report is persisted, not regenerated on demand, so a report from a prior month remains reproducible even after later recalculation. Satisfies the "report versioning" gap in `ARCHITECT_AUDIT.md`.

### notifications
- `id`, `user_id`, `type`, `title`, `body`, `link`, `read_at`, `created_at`
- See `16_NOTIFICATION.md`.

### refresh_tokens
- `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at`, `user_agent`, `ip_address`
- See `05_AUTHENTICATION.md`.

## 3. Cross-Cutting Column Conventions

Applied to **every** master-data and configuration table (per `AGENTS.md` soft-delete mandate):
- `deleted_at TIMESTAMP NULL` — soft delete marker; all reads default to `WHERE deleted_at IS NULL`.
- `created_by_user_id`, `updated_by_user_id` — ownership tracking, in addition to the append-only `audit_logs` table (`23_AUDIT_TRAIL.md`).
- `created_at`, `updated_at` — standard timestamps.

Transactional and calculation tables (`cost_entries`, `allocated_costs`, `profitability_results`, etc.) are **append-only** and not soft-deleted; corrections happen via new `upload_batches`/`allocation_runs`, never in-place edits (per `01_BUSINESS_RULES.md` §4-5).

## 4. Relationship Summary (key foreign keys)

```
organizations 1─* hospitals 1─* branches
hospitals 1─* cost_centers, profit_centers, drivers, doctors, services,
              employees, assets, vendors, bmhp_items, tariffs, periods
cost_centers 1─* allocation_rules *─1 drivers
services *─1 profit_centers
upload_batches 1─* upload_rows_staging, validation_errors
upload_batches 1─* cost_entries|revenue_entries|driver_values|medical_activities (via source_file_id)
periods 1─* allocation_runs
allocation_runs 1─* allocated_costs, profitability_results, service_unit_costs, doctor_profitability_results
allocation_runs 0..1 supersedes_run_id → allocation_runs (self-reference, see 01_BUSINESS_RULES.md §4)
users *─1 roles *─* permissions (via role_permissions)
```

## 5. Entities Explicitly Out of Scope for MVP

- `reciprocal_allocation_coefficients` (needed only if Reciprocal Allocation is built — Phase 2, see `40_PRODUCT_ROADMAP.md`)
- `hospital_branding` / white-label assets (see `15_REPORTING.md` §Out of Scope)
