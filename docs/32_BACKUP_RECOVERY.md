# 32 — Backup & Recovery

Status: Draft v1. Complements `26_DATA_RETENTION.md` (product-level data lifecycle, distinct from infrastructure backup) and `21_NON_FUNCTIONAL_REQUIREMENTS.md` (availability targets).

## 1. Backup Scope

| System | Method | Frequency | Retention |
|---|---|---|---|
| Postgres (primary datastore — all tenant data, calculation results, audit logs) | Automated managed-provider snapshot + continuous WAL archiving | Daily full snapshot, continuous WAL | 30 days rolling, monthly snapshot retained 12 months |
| S3-compatible object storage (uploaded files, report exports) | Provider-native versioning/replication | Continuous | Matches `26_DATA_RETENTION.md` file-category retention |
| Redis | Not backed up (ephemeral: queue state, cache, session-adjacent data only — no data here is a system of record) | N/A | N/A |

## 2. Recovery Objectives

- **RPO (Recovery Point Objective)**: ≤ 15 minutes for Postgres, via continuous WAL archiving (point-in-time recovery), given this is financial data where losing even a day of uploaded/calculated data is unacceptable to a CFO persona (`20_PERSONAS.md`).
- **RTO (Recovery Time Objective)**: ≤ 4 hours for full platform restoration from a catastrophic primary-region failure, consistent with the 99.5% availability target in `21_NON_FUNCTIONAL_REQUIREMENTS.md` §2 (a single incident within that budget).

## 3. Restore Testing

- A quarterly restore drill (restore the latest backup into an isolated environment, run the acceptance-criteria smoke checks from `22_ACCEPTANCE_CRITERIA.md` §10 against it) is required — an untested backup is not a verified recovery capability. Drill results logged and reviewed by engineering leadership.

## 4. Tenant-Level Recovery

- Because all tenants share one database (`03_MULTI_TENANT.md` §6), a restore is platform-wide, not per-tenant, by default. A single-tenant "undo" (e.g., a customer accidentally deletes significant data) is instead handled via the soft-delete pattern (`02_DOMAIN_MODEL.md` §3) and audit trail (`23_AUDIT_TRAIL.md`) — restoring one tenant's data from a full-platform snapshot without affecting others requires a manual, engineering-assisted extraction process, documented as a support runbook (outside this document's scope) rather than a self-service feature.

## 5. Disaster Recovery Communication

- A production incident invoking backup/recovery procedures triggers the same notification path used for planned maintenance (`21_NON_FUNCTIONAL_REQUIREMENTS.md` §2), with status communicated via a status page (mechanism TBD at infrastructure-selection time) rather than in-app only, since in-app notification is unavailable if the platform itself is down.
