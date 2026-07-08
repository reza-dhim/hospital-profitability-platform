# 31 — Logging

Status: Draft v1. Complements `30_MONITORING.md`, `17_ERROR_HANDLING.md` (`traceId` correlation), `23_AUDIT_TRAIL.md` (audit logs are a distinct, business-facing concept from operational logs defined here).

## 1. Structured Logging

- All application logs are structured JSON (not free-text), including at minimum: `timestamp`, `level`, `message`, `traceId`, `orgId`/`hospitalId` (when in a tenant-scoped request context), `userId` (when authenticated), `module`.
- `traceId` is generated per incoming request (or reused if provided via an inbound header for distributed tracing) and threaded through every log line and async job spawned from that request (e.g., an allocation run triggered by a request carries the originating `traceId` into its BullMQ job logs) — this is what makes the `traceId` in an API error response (`17_ERROR_HANDLING.md` §1) actually useful for debugging.

## 2. Log Levels

| Level | Usage |
|---|---|
| `error` | Unhandled exceptions, failed jobs, integration failures (AI/S3/email) |
| `warn` | Degraded-but-handled conditions (AI fallback triggered, validation warning threshold reached, rate limit approaching) |
| `info` | Key lifecycle events (allocation run started/completed, upload confirmed, user login) |
| `debug` | Verbose, disabled in production by default, enabled per-request via a debug flag for support investigation |

## 3. What Must Never Be Logged

- Passwords, raw JWT/refresh tokens, full credit-card-equivalent data (n/a for this product), and — given `14_SECURITY.md` §2 — doctor/employee PII should not appear in log lines beyond IDs; log human-readable business events by ID and let the audit trail (`23_AUDIT_TRAIL.md`) or the database itself be the source of readable detail, keeping ops logs safe to grant broader engineering access to.

## 4. Retention

- Operational logs: 90 days hot/searchable, then discarded (distinct from `audit_logs`, which per `26_DATA_RETENTION.md` is retained indefinitely/12 months depending on category — audit logs are a database table, not a log-pipeline artifact, precisely so they survive independent of log retention policy).

## 5. Correlation With Monitoring

- Every alert defined in `30_MONITORING.md` should be answerable by pivoting from the metric to the corresponding structured logs via `traceId`/`module` — logging and monitoring are designed together, not as separate afterthought systems.
