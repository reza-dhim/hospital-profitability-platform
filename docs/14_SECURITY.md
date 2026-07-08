# 14 — Security Requirements

Status: Draft v1 — resolves the "Missing Security Requirement" gap in `ARCHITECT_AUDIT.md`. Complements `05_AUTHENTICATION.md` (auth mechanism) and `04_RBAC.md` (authorization) and `03_MULTI_TENANT.md` (tenant isolation). References `PRODUCT_BIBLE.md` for why this data is sensitive (financial + doctor performance data).

## 1. Data Protection

- **In transit**: TLS 1.2+ enforced on all external endpoints (frontend↔backend, backend↔OpenAI, backend↔S3); HSTS enabled.
- **At rest**: Postgres encryption at rest (provider-managed disk encryption at minimum); S3-compatible storage server-side encryption for uploaded files and generated reports. `password_hash` uses argon2id (`05_AUTHENTICATION.md` §3); no other field-level application encryption in v1 beyond what's structurally required (secrets, tokens).
- **Secrets management**: environment variables sourced from a managed secrets store (not committed to the repo, not baked into container images); rotated on a defined schedule (documented in `29_DEPLOYMENT.md`).

## 2. Compliance Framing

- Indonesia's **UU PDP (Personal Data Protection Law)** applies to employee, doctor, and user personal data stored by the platform. Required before production launch: a data processing record, a lawful-basis statement for processing doctor/employee data, and a data subject request (access/deletion) process — tracked as a launch blocker in `40_PRODUCT_ROADMAP.md`, owned jointly by legal and engineering.
- The platform does not store patient-identifiable clinical data (`medical_activities` is aggregate/procedural, not a patient EMR) — this scoping decision keeps the platform outside stricter clinical-data regulation, and must not be changed without revisiting this section.

## 3. Rate Limiting & Abuse Prevention

- Login endpoints: rate-limited per IP and per account (`05_AUTHENTICATION.md` §3 lockout policy).
- All authenticated API endpoints: token-bucket rate limit per user (default 300 req/min), configurable per endpoint class — AI endpoints have a stricter limit given cost (`12_AI_ENGINE.md` §3).
- Upload endpoints: limited by file-size/row caps (`06_UPLOAD_ENGINE.md` §3) plus a per-hospital daily upload count cap to prevent storage/queue abuse.

## 4. File Upload Security

Covered in detail in `06_UPLOAD_ENGINE.md` §4: MIME/signature validation, formula-injection neutralization, virus scanning, private signed-URL storage.

## 5. Tenant Isolation

Covered in detail in `03_MULTI_TENANT.md` §2: RLS + application-layer scoping, defense in depth, mandatory isolation test suite.

## 6. Audit Log Integrity

- `audit_logs` is **append-only** at the application layer (no `UPDATE`/`DELETE` code path exists for this table) and additionally protected by a Postgres-level `REVOKE UPDATE, DELETE` on the table for the application's DB role — only a migration run under a privileged role could alter it, which is itself an out-of-band, logged infrastructure event.
- Tamper-evidence (hash-chaining audit rows) is out of scope for MVP but documented here as a Phase 2 candidate if a customer's compliance requirement demands it (`40_PRODUCT_ROADMAP.md`).

## 7. Application Security Practices

- Input validation via Zod (frontend) and NestJS `class-validator`/DTOs (backend) on every endpoint — no endpoint trusts client-supplied IDs without a scoped-existence check (prevents IDOR).
- Parameterized queries only (Prisma default) — no raw string-interpolated SQL, including in the Cost Allocation Engine's raw-SQL paths (`08_COST_ALLOCATION_ENGINE.md` §6 uses Prisma's typed raw-query interface, not string concatenation).
- Dependency vulnerability scanning (`npm audit`/Snyk equivalent) in CI (`29_DEPLOYMENT.md`).
- Standard OWASP Top 10 controls apply per `AGENTS.md`'s baseline instruction: this document is the enterprise-specific elaboration, not a replacement.

## 8. Security Review Cadence

- A security review pass is required before each major release and before the MVP ships (see `40_PRODUCT_ROADMAP.md` Sprint 10). Penetration testing (external) is recommended before the first enterprise customer's data goes live, tracked as a launch readiness item, not an engineering deliverable in this doc set.
