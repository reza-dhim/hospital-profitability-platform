# Changelog

All notable changes to this project are documented here, grouped by sprint (per `docs/ARCHITECT_AUDIT.md` §Sprint Planning) rather than semantic-version releases, since the platform is pre-release. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## Sprint 2.1 — Authentication Foundation (2026-07-08)

### Added
- JWT authentication: RS256-signed access tokens (15 min TTL), carrying `sub`/`org_id`/`active_hospital_id`/`role`/`permissions_hash` per `docs/05_AUTHENTICATION.md` §1.
- Rotating refresh tokens: opaque random value, SHA-256 hashed at rest, delivered as an `httpOnly`/`sameSite=strict` cookie scoped to `/api/v1/auth`. Reusing an already-rotated token is treated as a replay signal and revokes every active token for that user.
- Argon2id password hashing (`PasswordService`).
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Global guard stack: `JwtAuthGuard` (secure-by-default, `@Public()` opt-out), `RolesGuard` (`@Roles(...)`), `PermissionsGuard` (`@RequirePermissions(...)`, live DB check against `role_permissions`).
- `JwtStrategy` (Passport), `CurrentUser`/`Public`/`Roles`/`RequirePermissions` decorators.
- `mfaEnabled`/`mfaSecret` reserved fields on `User` (schema only — no MFA logic yet, per `docs/05_AUTHENTICATION.md` §3).
- `tokenHash` uniqueness constraint on `RefreshToken`.
- `pnpm --filter @hpp/api generate:jwt-keys` — generates a local-dev RS256 keypair into `.env`.
- Starter RBAC seed data: `rbac.read`/`rbac.write` permissions granted to `system_admin`, and an initial Super Admin login (`SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD`).
- 46 new unit tests covering password hashing, token issuance/verification, permission resolution, all three guards, and the full login/refresh/logout/me service and controller behavior.
- `HttpExceptionFilter` now honors a custom `code` on a thrown exception's body (e.g. `AUTH_INVALID_CREDENTIALS`) instead of only the generic per-HTTP-status default.

### Changed
- Every previously-public placeholder route (master-data, upload, allocation, profitability, doctor-analytics, ai, reporting, audit) now requires a valid access token by default, as a side effect of the global `JwtAuthGuard` — no changes to those controllers themselves. `GET /health` stays `@Public()`.
- `apps/api/.env.example`: `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` placeholders replaced with `JWT_ACCESS_PRIVATE_KEY`/`JWT_ACCESS_PUBLIC_KEY` (generated via the new script) and `SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD`.

### Out of scope (deliberately deferred, see `docs/05_AUTHENTICATION.md`)
Rate limiting, account lockout, password reset, breached-password checks, MFA logic (schema only), `GET`/`DELETE /auth/sessions`, Postgres RLS / `TenantScopeGuard` (`docs/03_MULTI_TENANT.md` §2), SSO.

## Sprint 1 — Platform Skeleton (2026-07-08)

### Added
- pnpm + Turborepo monorepo (`apps/web`, `apps/api`, `packages/ui`, `packages/domain`, `packages/contracts`, `packages/config`).
- Next.js App Router frontend: `AppShell`/`Sidebar`/`Topbar`/`PageHeader`/`EmptyState`/`ErrorState`/`GuidedTooltip` components, light/dark theming, and the 9 placeholder routes (dashboard, master-data, upload-center, cost-allocation, profitability, doctor-analytics, ai-insights, reports, settings).
- NestJS backend: `GET /health`, nine bounded-context module skeletons (each a `501 Not Implemented` placeholder), global exception filter (standard error envelope), audit interceptor skeleton, Swagger at `/api/docs`.
- Prisma schema (Tenancy + Identity groups): `Organization`, `Hospital`, `Branch`, `User`, `Role`, `Permission`, `RolePermission`, `RefreshToken`. Seed script for a fixture hospital + six default roles.
- `packages/domain`: framework-free implementations of every formula in `docs/18_FORMULA_REFERENCE.md` (Allocated Cost, Unit Cost, Gross Profit, Margin, Tariff Gap, Recommended Tariff) plus target-margin resolution, using `decimal.js`.
- `docker-compose.yml` (local Postgres + Redis), CI pipeline (install/lint/typecheck/test/build/migrate-check/docs-check).
