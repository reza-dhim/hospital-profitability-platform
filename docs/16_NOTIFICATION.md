# 16 — Notification

Status: Draft v1. Persistence: `notifications` (`02_DOMAIN_MODEL.md`). Triggers referenced from `06_UPLOAD_ENGINE.md`, `08_COST_ALLOCATION_ENGINE.md`, `15_REPORTING.md`, `13_AI_GOVERNANCE.md`.

## 1. Notification Triggers (MVP)

| Event | Recipient | Channel |
|---|---|---|
| Upload validation completed (pass or fail) | Uploading user | In-app + email |
| Allocation run completed / failed | Run initiator + hospital's `Tim Costing`/`CFO` | In-app |
| Scheduled report generated & delivered | Schedule recipients | Email (per `15_REPORTING.md` §3) + in-app for schedule owner |
| AI proposal awaiting approval | `CFO/Finance Director` | In-app |
| Period locked / reopened | Affected hospital's admins and `Tim Costing` | In-app |
| Account locked (failed logins) | The user | Email (per `05_AUTHENTICATION.md` §3) |

## 2. Channels

- **In-app**: `notifications` table, surfaced via a bell icon + notification center in the app shell (`37_COMPONENT_LIBRARY.md`); polled or delivered via a lightweight push mechanism (WebSocket/SSE) — implementation detail left open, polling is an acceptable MVP fallback.
- **Email**: transactional email provider (SMTP-compatible), templated per event type. No SMS/push-mobile channel in MVP (no mobile app).

## 3. Data Shape

`notifications`: `type`, `title`, `body`, `link` (deep link into the relevant page, e.g., the specific `allocation_run` or `upload_batch`), `read_at`. Read/unread state drives the bell-icon badge count. Notifications older than the retention window (`26_DATA_RETENTION.md`) are purged.

## 4. User Preferences

- Out of scope for granular per-event opt-out in MVP; a single "email notifications on/off" toggle per user is sufficient (in-app notifications cannot be disabled, since they're the system of record for "did this run succeed"). Granular preferences are a `40_PRODUCT_ROADMAP.md` candidate.
