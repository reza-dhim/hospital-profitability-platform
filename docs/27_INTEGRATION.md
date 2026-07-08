# 27 — Integration

Status: Draft v1. MVP scope: no live third-party system integrations beyond the AI provider and email/storage infrastructure already covered elsewhere. This document defines the boundary and the extension points for future integrations, since "enterprise SaaS" buyers routinely ask about this even before it's built.

## 1. MVP Integration Surface

| System | Direction | Covered in |
|---|---|---|
| OpenAI API | Outbound | `12_AI_ENGINE.md`, `13_AI_GOVERNANCE.md` |
| S3-compatible object storage | Outbound | `06_UPLOAD_ENGINE.md` §4, `15_REPORTING.md` §5 |
| Transactional email provider | Outbound | `16_NOTIFICATION.md`, `05_AUTHENTICATION.md` §3 |

There is **no** integration with a hospital's existing HIS (Hospital Information System), ERP, or accounting software in MVP. Data enters the platform exclusively via the Excel Upload Engine (`06_UPLOAD_ENGINE.md`). This is a deliberate MVP scoping decision — HIS/ERP integration is high-variance per hospital (every hospital's existing system differs) and would otherwise dominate the project's early timeline.

## 2. Why Excel-First

- Every target persona (`20_PERSONAS.md`) already works with Excel for costing data today (per `PRODUCT_BIBLE.md`'s framing of the current-state problem). The Upload Engine is intentionally the primary integration mechanism for MVP rather than a liability to be replaced — it is the integration strategy.

## 3. Future Integration Points (Phase 2 candidates, `40_PRODUCT_ROADMAP.md`)

- **HIS/EMR read integration**: pull `medical_activities` volume/duration directly rather than via manual export-then-upload, once a specific hospital's HIS vendor and data contract are known (cannot be generically designed without that specificity).
- **Accounting/ERP (e.g., SAP, Accurate, Zahir)**: pull `cost_entries`/`coa_accounts` automatically.
- **SSO/SAML** (`05_AUTHENTICATION.md` §5): identity provider integration for enterprise IT requirements.
- **Outbound webhook** for allocation-run-completed events, to let a hospital's own BI tooling react to new results without polling.

## 4. API-First Posture

Even without live integrations in MVP, the backend is built API-first (`API_SPEC.md`, `28_OPENAPI_STRATEGY.md`) so that any future integration consumes the same versioned, documented API surface the frontend uses — no private/undocumented endpoints.
