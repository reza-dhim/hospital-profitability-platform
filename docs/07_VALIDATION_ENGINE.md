# 07 — Validation Engine

Status: Draft v1 — expands the validation rule list in `PRD.md` §Validation into an implementation-ready error taxonomy. Persistence: `validation_errors` (`02_DOMAIN_MODEL.md`). Consumed by `06_UPLOAD_ENGINE.md` step 4-5.

## 1. Validation Passes

Validation runs in three ordered passes; a failure in an earlier pass short-circuits later passes for that row (to avoid noisy cascading errors) but not for the batch as a whole (other rows continue independently):

1. **Structural** — file/format level, applies before row parsing.
2. **Row-level** — per-row field validity, independent of other rows.
3. **Cross-row / referential** — duplicate detection, mapping against master data, outlier detection relative to the batch or historical data.

## 2. Error Code Taxonomy

| Code | Pass | Severity | Description |
|---|---|---|---|
| `E_FILE_FORMAT` | Structural | error | File is not `.xlsx` or fails signature check. |
| `E_TEMPLATE_VERSION` | Structural | error | Uploaded file does not match the current template version/columns. |
| `E_REQUIRED_COLUMN_MISSING` | Structural | error | Expected column header absent. |
| `E_MISSING_VALUE` | Row-level | error | Required cell is empty. |
| `E_INVALID_TYPE` | Row-level | error | Cell value cannot be parsed as expected type (number/date/enum). |
| `E_INVALID_PERIOD` | Row-level | error | Period does not exist or is not `open` (`01_BUSINESS_RULES.md` §9). |
| `E_INVALID_COST_CENTER` | Row-level | error | `cost_center` code not found in this hospital's master data. |
| `E_INVALID_PROFIT_CENTER` | Row-level | error | `profit_center` code not found. |
| `E_INVALID_DRIVER` | Row-level | error | `driver` code not found. |
| `E_INVALID_SERVICE` | Row-level | error | `service` code not found. |
| `E_INVALID_DOCTOR` | Row-level | error | `doctor` code not found. |
| `E_MAPPING_MISMATCH` | Cross-row | error | e.g., a `service` row references a `profit_center` inconsistent with the service's configured profit center. |
| `E_DUPLICATE_ROW` | Cross-row | warning | Same natural key (period + cost_center + coa_account, etc.) appears more than once in this batch or already exists (confirmed) for this period from a prior batch. |
| `W_OUTLIER_NOMINAL` | Cross-row | warning | Nominal value is > 3 standard deviations from the same cost/profit center's trailing 6-period average. |
| `W_ZERO_VALUE` | Row-level | warning | Nominal is zero — allowed but flagged for confirmation. |

Severity `error` blocks batch confirmation entirely. Severity `warning` requires explicit user acknowledgment (checkbox: "I reviewed N warnings and confirm upload") but does not block.

## 3. Outlier Detection Method

- `W_OUTLIER_NOMINAL` uses a trailing 6-period rolling mean/stddev per `(cost_center_id, coa_account_id)` or `(profit_center_id, service_id)` pair. Fewer than 3 historical periods available → outlier check is skipped for that row (insufficient baseline), not treated as pass or fail.
- This is a heuristic guard-rail for data-entry mistakes, not a statistical/AI anomaly model — the AI-driven anomaly detection (semantic, cross-factor) is a separate, richer capability in `12_AI_ENGINE.md`.

## 4. Validation Result API Contract

`GET /uploads/:id/validation` response shape:
```json
{
  "uploadBatchId": "uuid",
  "status": "validated",
  "summary": { "totalRows": 1200, "validRows": 1180, "errorRows": 15, "warningRows": 5 },
  "errors": [
    { "rowNumber": 42, "column": "cost_center_code", "code": "E_INVALID_COST_CENTER", "severity": "error", "message": "Cost center 'CC-099' not found." }
  ]
}
```
Paginated when `errors` exceeds 200 entries (query params per `API_SPEC.md` pagination convention, defined in `28_OPENAPI_STRATEGY.md`).

## 5. Extensibility

- Validation rules are implemented as an ordered list of pure functions (`ValidationRule` interface) per upload `type`, registered in a rule registry — new rules (e.g., hospital-specific custom checks) can be added without touching the pipeline orchestration. This satisfies `AGENTS.md`'s "never hardcode business rules" principle: rule thresholds (e.g., outlier stddev multiplier) are read from `hospital_settings`/config, not literals in code.
