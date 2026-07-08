# 26 — Data Retention

Status: Draft v1 — resolves the "no data retention/archival policy" gap in `ARCHITECT_AUDIT.md`. Interacts with `14_SECURITY.md` (compliance), `23_AUDIT_TRAIL.md`, `15_REPORTING.md`, `12_AI_ENGINE.md` §5.

## 1. Retention Table

| Data Category | Retention | Rationale |
|---|---|---|
| Transactional data (`cost_entries`, `revenue_entries`, `medical_activities`, `driver_values`) | Indefinite (append-only, never purged automatically) | Financial history; low storage cost relative to value; supports multi-year trend analysis. |
| Calculation results (`allocation_runs`, `allocated_costs`, `profitability_results`, `doctor_profitability_results`) | Indefinite | Audit/reproducibility requirement (`01_BUSINESS_RULES.md` §4). |
| Uploaded source files (`upload_batches.file_url`) | 24 months, then archived to cold storage (not deleted) | Balances storage cost with the practical need to re-inspect a source file; live tables already retain the promoted data indefinitely. |
| Generated reports (`report_exports`) | 24 months live, then archived | Matches upload file retention; reproducibility already covered by underlying data being indefinite. |
| Audit logs (financial/RBAC/tariff events) | Indefinite | `23_AUDIT_TRAIL.md` §4. |
| Audit logs (authentication events: login/logout) | 12 months | Security monitoring window; lower long-term value. |
| Notifications | 6 months, then purged | Operational, not a record of truth. |
| AI conversations (`ai_conversations`/`ai_messages`) | 12 months, then purged (unless pinned by user) | Balances usefulness of history with data-minimization principle (`13_AI_GOVERNANCE.md` §2). |
| `ai_insights` / `ai_proposals` | Indefinite | These are decision artifacts (tariff rationale) with audit value, even after acceptance/rejection. |
| Soft-deleted master data (`deleted_at` set) | Indefinite, hidden from active views | Referential integrity with historical calculation results (`22_ACCEPTANCE_CRITERIA.md` §2). |

## 2. Deletion Mechanics

- All time-boxed purges run as a scheduled job (BullMQ recurring), never ad hoc — ensures consistent, auditable enforcement rather than manual cleanup.
- "Archived to cold storage" means moved to a cheaper storage tier with a longer retrieval latency, still recoverable on request (e.g., by `System Admin` support ticket), not deleted.

## 3. Data Subject Requests (UU PDP)

- Per `14_SECURITY.md` §2, employee/doctor/user personal data is subject to Indonesia's UU PDP. A data-subject access/deletion request is handled manually by `System Admin`/platform operators in MVP (no self-service portal) — deletion of a `doctor`/`employee`/`user` record follows the same soft-delete pattern (their historical financial contribution remains in aggregate calculation results, which are not personal data once aggregated), while directly identifying fields (name, contact info) are nulled out on request where retention of aggregate history doesn't legally require them.

## 4. Backup Retention

Distinct from application-level data retention above — see `32_BACKUP_RECOVERY.md` for backup snapshot retention windows (a backup/disaster-recovery concern, not a product data-lifecycle one).
