# 17 — Error Handling

Status: Draft v1 — resolves the "no error response format" gap in `ARCHITECT_AUDIT.md`. Applies across all endpoints in `API_SPEC.md`. UI-side error state mandate: `AGENTS.md` ("every page must include ... error state").

## 1. Standard Error Response Shape

All API error responses (4xx/5xx) share one envelope:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable summary safe to display.",
    "details": [ { "field": "driverPercentage", "issue": "must sum to 100%" } ],
    "traceId": "uuid"
  }
}
```
- `code`: stable, machine-readable, namespaced by concern (`AUTH_*`, `VALIDATION_*`, `PERMISSION_*`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `AI_UNAVAILABLE`, `INTERNAL`).
- `traceId`: correlates to server-side structured logs (`31_LOGGING.md`) for support/debugging without exposing internals to the client.
- `message` is always safe for direct UI display; stack traces / internal details never serialize to the client, in any environment (prevents information leakage — differs from dev-mode-verbose patterns common in smaller apps).

## 2. HTTP Status Mapping

| Status | Meaning | Example |
|---|---|---|
| 400 | Malformed request / DTO validation failure | Missing required field |
| 401 | Not authenticated / expired token | `05_AUTHENTICATION.md` |
| 403 | Authenticated but not permitted | `04_RBAC.md` |
| 404 | Resource not found or not in caller's tenant scope (never distinguished from "doesn't exist" — prevents tenant-existence probing) | |
| 409 | Conflict (e.g., confirming an already-confirmed upload batch, cyclic allocation priority) | `08_COST_ALLOCATION_ENGINE.md` §2 |
| 422 | Semantically invalid (passes schema validation but fails business rule) | Target margin ≥ 100% |
| 429 | Rate limited | `14_SECURITY.md` §3 |
| 502/503 | Upstream dependency failure (AI provider down) | Degrades gracefully per `12_AI_ENGINE.md` §3 |
| 500 | Unhandled server error | Logged with `traceId`, generic message to client |

## 3. Frontend Error States

Per `AGENTS.md`, every page/data-fetching component implements four states: loading (skeleton, `37_COMPONENT_LIBRARY.md`), empty (guided empty state with CTA), error (retry affordance + human-readable message from the envelope above), success. Error state components must never show raw error codes to end users — codes map to localized, friendly copy via a central error-message dictionary (also supports the future i18n candidate in `35_ACCESSIBILITY.md`).

## 4. Retry & Idempotency

- Mutating endpoints that trigger async work (`POST /uploads/:type`, `POST /allocation-runs`) accept an optional `Idempotency-Key` header; a repeated request with the same key within a 24-hour window returns the original result rather than creating a duplicate job — prevents double-submission from network retries or impatient double-clicks.
- Transient upstream failures (AI provider, S3) are retried with exponential backoff at the service layer (max 3 attempts) before surfacing a 502/503 to the client.

## 5. Validation Errors vs. Business Rule Errors

Distinguish DTO-level validation (400, structural) from domain-rule violations (422, e.g., `01_BUSINESS_RULES.md` constraints like "period must be open") — this separation lets the frontend treat them differently (400 typically means a frontend bug/stale form; 422 is an expected, user-facing business condition to explain clearly).
