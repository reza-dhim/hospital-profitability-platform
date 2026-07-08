# 23 — Audit Trail

Status: Draft v1. Entity: `audit_logs` (`DATABASE_SCHEMA.md`, `02_DOMAIN_MODEL.md`). Integrity controls: `14_SECURITY.md` §6.

## 1. What Is Audited

Every mutating action across the platform, specifically including (not limited to):
- Master data create/update/delete (soft-delete) — before/after JSON diff.
- Upload confirm/rollback.
- Allocation run trigger/recalculate.
- Tariff/target-margin change (`01_BUSINESS_RULES.md` §6, §8).
- AI proposal approval/rejection (`13_AI_GOVERNANCE.md` §7).
- Period lock/reopen (`25_PERIOD_CLOSING.md`).
- RBAC changes (role/permission edits, user membership changes, `04_RBAC.md`).
- Authentication events: login success/failure, lockout, password reset, session revocation (`05_AUTHENTICATION.md`).
- Support/impersonation sessions (`03_MULTI_TENANT.md` §3).

Read-only actions (viewing a dashboard) are **not** audit-logged individually — that volume is not actionable and belongs in analytics/usage telemetry (`30_MONITORING.md`), not the audit trail.

## 2. Entry Shape

`audit_logs`: `user_id`, `action` (verb, e.g. `tariff.update`), `entity` (table name), `entity_id`, `before_json`, `after_json`, `ip_address`, `created_at` (`DATABASE_SCHEMA.md` base + `ip_address` addition here for security-relevant events).

## 3. Implementation Pattern

- A single NestJS `AuditInterceptor` applied globally captures mutating requests (POST/PATCH/DELETE) and writes the entry after successful completion (not on failed requests, except authentication failures which are logged by the auth module directly for security monitoring). This avoids scattering manual audit-log calls through every service (`AGENTS.md` reusability principle) — one interceptor, consistently applied, is the enforcement mechanism for "every CRUD must include audit trail."
- Bulk operations (upload confirm promoting thousands of rows) log **one** audit entry per batch operation (referencing the `upload_batch_id`), not one per row — row-level detail is already in `upload_rows_staging`/`validation_errors`.

## 4. Access & Retention

- Visible to `Direktur`, `CFO`, `System Admin` (read), and to each user for their own actions (`Tim Costing`, per `04_RBAC.md`).
- UI: `AuditTimeline` component (`37_COMPONENT_LIBRARY.md`), filterable by entity/user/date range, attached contextually (e.g., a tariff's detail page shows its own change history) and globally (a full audit log page for admins).
- Retention: indefinite for financial/tariff/RBAC events; standard retention window for authentication events per `26_DATA_RETENTION.md`.

## 5. Integrity

See `14_SECURITY.md` §6 — append-only enforcement at both application and DB-role level.
