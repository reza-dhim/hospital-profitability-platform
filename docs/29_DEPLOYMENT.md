# 29 — Deployment

Status: Draft v1 — resolves the "no environment/deployment doc" gap in `ARCHITECT_AUDIT.md`. Complements `21_NON_FUNCTIONAL_REQUIREMENTS.md` (scale targets) and `14_SECURITY.md` (secrets).

## 1. Environments

| Environment | Purpose | Data |
|---|---|---|
| `local` | Individual developer machine (Docker Compose: Postgres, Redis, backend, frontend) | Synthetic/seed data only |
| `staging` | Pre-production validation, QA, demo | Synthetic/anonymized data only — never real hospital data |
| `production` | Live customer data | Real, tenant-isolated (`03_MULTI_TENANT.md`) |

## 2. CI/CD Pipeline (outline)

```
PR opened  → lint + typecheck + unit tests + contract tests (28_OPENAPI_STRATEGY.md §6) + dependency scan (14_SECURITY.md §7)
PR merged to main → build container images → deploy to staging → smoke tests
Release tag → deploy to production (manual approval gate) → post-deploy smoke tests → migration run
```
- Database migrations (Prisma Migrate) run as an explicit, separate pipeline step before the new application version receives traffic — never implicit/automatic on app boot, to keep migration failures visible and rollback-able independently of app deploys.

## 3. Infrastructure Shape

- Containerized (Docker) NestJS backend + Next.js frontend, deployed to a managed container platform (exact provider is a business decision outside this document's scope — this section specifies requirements, not a vendor). Requirements: horizontal scalability of the API tier (`21_NON_FUNCTIONAL_REQUIREMENTS.md` §4), separate scaling for BullMQ workers vs. the API tier, managed Postgres with automated backups (`32_BACKUP_RECOVERY.md`), managed Redis.
- Environment-specific configuration via environment variables only, sourced from a secrets manager (`14_SECURITY.md` §1) — no environment-specific code branches.

## 4. Rollback Strategy

- Application rollback: redeploy the previous container image tag (images are immutable and retained for at least the last 10 releases).
- Migration rollback: Prisma migrations are written to be backward-compatible for at least one release (additive-first pattern — add nullable column, backfill, then enforce constraint in a later release) so an application rollback never requires a destructive schema rollback in production.

## 5. Zero-Downtime Deployment

- Rolling deployment (new instances health-checked and receiving traffic before old instances are terminated). BullMQ workers drain in-flight jobs before shutdown (graceful shutdown handler) rather than being killed mid-allocation-run.

## 6. Configuration Promotion

- `hospital_settings` and other tenant data never differ by environment logic in code — environment differences are limited to infrastructure config (DB connection, API keys, feature flags at the platform level per `24_CONFIGURATION.md` §5), keeping `staging` a true behavioral mirror of `production`.
