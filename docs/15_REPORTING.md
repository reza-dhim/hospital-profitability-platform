# 15 — Reporting

Status: Sprint 10 — on-demand generation for all 3 MVP report types implemented (`ReportingModule`), resolving the "Missing Reporting Requirement" gap in `ARCHITECT_AUDIT.md`. Endpoints: `API_SPEC.md` §Reports, plus `GET /reports/exports` (history list, a reasonable addition given `report_exports` is a fully persisted, listable table — not in `API_SPEC.md`'s literal 3 routes). Persistence: `report_exports` (`02_DOMAIN_MODEL.md`) is implemented; `report_schedules` (recurring generation + email delivery, §3 below) is deferred — no SMTP/email provider exists yet. Executive Summary's AI narrative section (§1's table) is also deferred — depends on Sprint 9's real AI Engine (`12_AI_ENGINE.md`), which doesn't exist yet; unlike What-If Simulation, this one genuinely needs an LLM call, not just a recomputation.

## 1. Report Types (MVP)

| Report | Format | Sections |
|---|---|---|
| Executive Summary | PDF | Hospital KPI header, revenue/cost/margin trend chart, top/bottom 5 profit centers, AI executive summary (with citations), period metadata (which allocation run). |
| Profitability Detail | Excel | One row per profit center (and drill-down sheet per service): revenue, direct cost, allocated cost, total cost, gross profit, margin, tariff gap. Raw-data sheet for further analysis. |
| Doctor Analytics | PDF | Per-service cohort comparison (aggregated, factor breakdown per `11_DOCTOR_ANALYTICS.md` §4), respecting the same `doctor_analytics.read_detail` permission gate as the live view (`04_RBAC.md` §5) — a user without detail access generates a report without doctor names. |

## 2. Generation & Versioning

- Every report generation (on-demand or scheduled) creates a `report_exports` row with the source `allocation_run_id`/`period_id` and a persisted file (`file_url`), per `02_DOMAIN_MODEL.md`. Reports are **not** regenerated in place — re-requesting "the June executive report" after a July recalculation of June data returns the same June PDF that was generated at the time, unless the user explicitly asks to regenerate against the latest run. This gives the CFO a reproducible point-in-time artifact.
- Report files retained per `26_DATA_RETENTION.md`.

## 3. Scheduling

- `report_schedules`: frequency (`weekly`\|`monthly`\|`quarterly`), recipients (list of user IDs or external emails), format. A BullMQ recurring job triggers generation and delivery.
- Delivery channel for MVP: **email** (link to a signed, time-boxed download URL, not the file as an attachment, to avoid large-attachment/spam-filter issues and to keep access auditable). In-app notification (`16_NOTIFICATION.md`) additionally created for the report's owner.
- Only `Tim Costing` role and above may create schedules (`04_RBAC.md`).

## 4. Branding / White-Label

Out of scope for MVP: reports use a single platform-neutral template (hospital name/logo inserted from `hospitals` master data, but no per-organization custom branding/theme engine). Candidate for `40_PRODUCT_ROADMAP.md` if the platform sells to hospital groups wanting their own branding on exports.

## 5. Generation Engine

- PDF: server-side rendering (e.g., a headless-browser or PDF-templating library) from the same data the dashboard uses, not a screenshot of the UI — ensures accessibility of the text content within the PDF and consistent output regardless of a user's browser state.
- Excel: generated via a server-side spreadsheet library producing native `.xlsx` (formulas not required in-cell; values are pre-computed server-side to avoid exposing calculation logic or drifting from the platform's own numbers).
