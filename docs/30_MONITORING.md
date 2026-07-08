# 30 — Monitoring

Status: Draft v1. Complements `31_LOGGING.md` (logs are one monitoring input) and `21_NON_FUNCTIONAL_REQUIREMENTS.md` (the targets being monitored against).

## 1. Golden Signals

| Signal | What's tracked |
|---|---|
| Latency | p50/p95/p99 per endpoint, especially dashboard reads and `POST /allocation-runs` |
| Traffic | Requests/min per endpoint, per tenant (anomalous per-tenant spikes inform `14_SECURITY.md` §3 rate-limit tuning) |
| Errors | 4xx/5xx rate per endpoint, distinguished by `error.code` (`17_ERROR_HANDLING.md`) |
| Saturation | BullMQ queue depth/age (upload parsing, allocation runs, report generation), DB connection pool utilization, Redis memory |

## 2. Business-Critical Job Monitoring

Beyond generic infra metrics, these pipelines get dedicated dashboards/alerts since they are the product's core value delivery:
- Allocation run duration and failure rate (alert if failure rate > 5% over 1 hour, or p95 duration exceeds the `21_NON_FUNCTIONAL_REQUIREMENTS.md` §3 target by 2x).
- Upload validation queue age (alert if a job sits unprocessed > 10 minutes — directly blocks a user waiting on the UI).
- AI request failure rate and latency (feeds the graceful-degradation decision in `12_AI_ENGINE.md` §3 — sustained AI failure should proactively page, not just silently degrade forever).

## 3. Alerting

- Paging alerts (on-call) for: production error rate exceeding threshold, database connectivity loss, queue processing halted, allocation-run failure rate spike.
- Non-paging (dashboard/Slack-equivalent channel) for: approaching AI token budget (`12_AI_ENGINE.md` §3), elevated but sub-threshold error rates, certificate expiry warnings.

## 4. Uptime & Synthetic Checks

- External synthetic check hitting `GET /health` (backend) and the frontend's root route every 1 minute from an independent monitoring service, feeding the uptime target in `21_NON_FUNCTIONAL_REQUIREMENTS.md` §2.

## 5. Per-Tenant Health Visibility

- A lightweight internal operations view (not customer-facing) showing, per hospital: last successful allocation run, upload activity recency, AI usage — lets support proactively notice a hospital that's stalled (e.g., hasn't closed a period in 2 months) rather than waiting for a complaint.

## 6. Tooling

- Vendor-agnostic requirement: structured metrics export (Prometheus-compatible or equivalent) from the NestJS backend, dashboarded via Grafana or an equivalent managed APM. Specific vendor selection is an infrastructure decision outside this document's scope.
