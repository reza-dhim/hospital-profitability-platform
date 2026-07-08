# 25 — Period Closing

Status: Draft v1 — resolves the "period/fiscal calendar rules" gap in `ARCHITECT_AUDIT.md`. Entity: `periods` (`02_DOMAIN_MODEL.md`). Referenced throughout `01_BUSINESS_RULES.md`, `06_UPLOAD_ENGINE.md`, `08_COST_ALLOCATION_ENGINE.md`.

## 1. Period Lifecycle

```
draft → open → locked → closed
                  ↑________|
                (reopen, System Admin only, audited)
```

| Status | Uploads allowed | Allocation runs allowed | Master data edits affecting this period |
|---|---|---|---|
| `draft` | No | No | N/A (period not yet active) |
| `open` | Yes | Yes | Yes |
| `locked` | No | No (existing results remain viewable) | No |
| `closed` | No | No | No |

- A period transitions `draft → open` automatically at the start of its date range (or manually by `System Admin` for hospitals wanting to prepare a period ahead of time).
- `open → locked`: manual action by `System Admin` or `CFO` once Tim Costing confirms the period's data and calculation are final (typically end of monthly close process, `19_USER_JOURNEY.md` §2).
- `locked → closed`: a further, less-reversible state after the period has been externally reported on (e.g., board reporting complete); closed periods require a stronger confirmation to reopen than locked ones, but the mechanism is the same reopen action.

## 2. Reopen Rule

- Only `System Admin` may reopen a `locked` or `closed` period, via an explicit action requiring a typed reason (stored on the audit entry, `23_AUDIT_TRAIL.md`). Reopening does **not** invalidate existing `allocation_runs` — they remain as historical runs; any new upload or recalculation after reopening creates new data/runs on top, following the same supersede/stale rules as `01_BUSINESS_RULES.md` §4-5.
- Reopening a `closed` period (as opposed to `locked`) additionally triggers a notification to `CFO`/`Direktur` (`16_NOTIFICATION.md`) given its higher sensitivity (numbers already externally reported may change).

## 3. Fiscal Calendar

- Periods are monthly by default, generated automatically based on `hospital_settings.fiscal_year_start_month` (`24_CONFIGURATION.md`). Non-monthly fiscal periods (quarterly-only reporting hospitals) are out of scope for MVP — the underlying `period` grain stays monthly even if reporting rolls up quarterly (`15_REPORTING.md`).

## 4. Interaction With Allocation Runs

An `allocation_run` always references exactly one `period_id`. `POST /allocation-runs` is rejected (422, per `17_ERROR_HANDLING.md`) if the target period is not `open`. This is the enforcement point for the "recalculation only permitted for open periods" rule in `01_BUSINESS_RULES.md` §4.
