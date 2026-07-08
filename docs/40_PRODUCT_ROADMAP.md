# 40 — Product Roadmap

Status: Draft v1 — consolidates the Phase 2 / "out of scope for MVP" candidates referenced throughout `01`–`39` into a single forward-looking view, plus the Sprint 0→MVP plan from `ARCHITECT_AUDIT.md`. This document is the living backlog; the Sprint plan in `ARCHITECT_AUDIT.md` remains the authoritative near-term execution plan unless superseded here.

## 1. MVP Scope (Sprint 0–10, per `ARCHITECT_AUDIT.md`)

Auth & RBAC, Master Data, Upload & Validation, Cost Allocation (Direct + Step-Down), Unit Cost & Profitability, Onboarding & Executive Dashboard, Doctor Analytics, AI v1 (insights, tariff proposals, copilot — governed per `13_AI_GOVERNANCE.md`), Reporting (PDF/Excel, scheduled email delivery), Audit Trail. Full sprint breakdown: `ARCHITECT_AUDIT.md` §Sprint Planning.

## 2. Phase 2 Candidates (post-MVP, sourced from gaps flagged across this doc set)

| Candidate | Source Reference |
|---|---|
| Reciprocal (simultaneous-equation) allocation method | `01_BUSINESS_RULES.md` §2, `08_COST_ALLOCATION_ENGINE.md` |
| Cross-hospital organization-level rollup dashboard | `03_MULTI_TENANT.md` §4 |
| Enterprise SSO/SAML/OIDC | `05_AUTHENTICATION.md` §5 |
| MFA (TOTP) | `05_AUTHENTICATION.md` §3 |
| Delegated/temporary role grants | `04_RBAC.md` §7 |
| Standard-cost / budget-based variance (beyond period-over-period) | `09_PROFITABILITY_ENGINE.md` §5 |
| HIS/EMR and ERP/accounting integrations | `27_INTEGRATION.md` §3 |
| Outbound webhooks | `27_INTEGRATION.md` §3 |
| Report white-labeling / multi-brand | `15_REPORTING.md` §4 |
| Granular per-event notification preferences | `16_NOTIFICATION.md` §4 |
| Audit log tamper-evidence (hash-chaining) | `14_SECURITY.md` §6 |
| Fine-tuned AI models on hospital-specific data | `12_AI_ENGINE.md` §6 |
| Schema-per-tenant physical isolation (contractual escape hatch) | `03_MULTI_TENANT.md` §6 |
| Full WCAG AAA / RTL support | `35_ACCESSIBILITY.md` §5 |
| Multi-language UI beyond Indonesian/English | `21_NON_FUNCTIONAL_REQUIREMENTS.md` §7 |

## 3. Launch Blockers (not engineering backlog — tracked here for visibility)

- Data Processing Agreement with AI provider (`13_AI_GOVERNANCE.md` §2).
- UU PDP compliance review (data subject request process, lawful-basis documentation) (`14_SECURITY.md` §2, `26_DATA_RETENTION.md` §3).
- External penetration test before first enterprise customer go-live (`14_SECURITY.md` §8).

## 4. Prioritization Principle

Phase 2 candidates are prioritized by: (a) how many current MVP users are blocked without it (e.g., a hospital group needing cross-hospital rollup outranks a single-hospital nice-to-have), (b) compliance/sales-blocking status (SSO is often a procurement blocker for larger hospital groups), and (c) engineering cost relative to the modular-monolith architecture's extension points already designed for it (`ARCHITECT_AUDIT.md` Engineering Recommendation) — items with a clean extension point (e.g., SSO's `AuthStrategy` abstraction, `05_AUTHENTICATION.md` §5) are cheaper to pull forward than those requiring architectural rework (e.g., schema-per-tenant).

## 5. Review Cadence

This roadmap is reviewed at the end of each MVP sprint and revised based on what's learned from the fixture hospital / early pilot usage — it is not a fixed commitment beyond the MVP scope in §1.
