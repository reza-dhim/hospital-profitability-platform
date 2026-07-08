# Sprint 2.1 Review — Authentication Foundation

Status: Complete (2026-07-08). Commit `db47a91`. Specced by `docs/05_AUTHENTICATION.md` (mechanism) and `docs/04_RBAC.md` §6 (guard infrastructure).

## 1. Features Implemented

- **Login** (`AuthService.login`) — email/password against `User`, Argon2id verification, generic `AUTH_INVALID_CREDENTIALS` for unknown email, wrong password, *or* a non-active/soft-deleted account (account-enumeration resistance).
- **Access tokens** — RS256-signed JWTs, 15-minute TTL, claims: `sub`, `org_id`, `active_hospital_id`, `role`, `permissions_hash`.
- **Refresh tokens** — opaque 384-bit random value (`crypto.randomBytes(48)`), delivered as an `httpOnly`/`sameSite=strict` cookie scoped to `/api/v1/auth`, 7-day TTL. Rotated on every use; presenting an already-rotated token revokes *all* active tokens for that user (replay detection).
- **Logout** — idempotent; revokes the presented refresh token and clears its cookie, no error on a missing/already-revoked token.
- **`GET /auth/me`** — returns the authenticated user, org, active hospital, role, and resolved permission codes.
- **Global guard stack** — `JwtAuthGuard` (secure-by-default; every route requires a valid access token unless annotated `@Public()`), `RolesGuard` (`@Roles(...)`), `PermissionsGuard` (`@RequirePermissions(...)`, live DB check rather than trusting the JWT's `permissions_hash`).
- **Decorators** — `@CurrentUser()`, `@Public()`, `@Roles()`, `@RequirePermissions()`.
- **Passport `JwtStrategy`** wired into the guard stack.
- **Seed data** — starter `rbac.read`/`rbac.write` permissions granted to `system_admin`, plus an initial Super Admin login (`SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD` in `apps/api/.env.example`).
- **Dev tooling** — `pnpm --filter @hpp/api generate:jwt-keys` generates a local RS256 keypair into `.env`.
- **`HttpExceptionFilter`** now honors a custom `code` on a thrown exception body (e.g. `AUTH_INVALID_CREDENTIALS`, `AUTH_INVALID_REFRESH_TOKEN`) instead of only the generic per-HTTP-status default.

## 2. Database Schema Changes

Two migrations on top of Sprint 1's `init`:

| Migration | Change |
|---|---|
| `20260708081232_add_user_mfa_fields` | `User.mfaEnabled` (`Boolean @default(false)`), `User.mfaSecret` (`String?`) — reserved columns only, no TOTP logic implemented. |
| `20260708082500_add_refresh_token_hash_unique` | `RefreshToken.tokenHash` gains a `@unique` constraint (was previously non-unique in Sprint 1's placeholder schema). |

No new tables. `RefreshToken` (already present as a Sprint 1 skeleton) is now actually written to and read from by real issuance/rotation logic.

## 3. API Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/login` | `@Public()` | Body: `LoginDto` (email, password). Returns `AuthTokensDto` (`accessToken`, `expiresIn`); sets refresh-token cookie. |
| `POST` | `/auth/refresh` | `@Public()`, cookie-based | Reads refresh cookie, rotates it, returns a new `AuthTokensDto`. |
| `POST` | `/auth/logout` | `@Public()`, cookie-based | `204 No Content`. Revokes + clears the refresh cookie. |
| `GET` | `/auth/me` | Bearer access token | Returns `CurrentUserDto` (id, name, email, status, organization, hospital, role, resolved `permissions`). |

Side effect: every previously-public Sprint 1 placeholder route (master-data, upload, allocation, profitability, doctor-analytics, ai, reporting, audit) now requires a valid access token by default, via the global `JwtAuthGuard`. `GET /health` remains `@Public()`.

## 4. Security Decisions

- **Asymmetric JWT signing (RS256)**, not a shared HMAC secret — private key stays on the API only; a public key can be handed to other services later without granting them signing capability.
- **Refresh tokens are opaque, not JWTs**, and hashed with SHA-256 (not Argon2) before storage: a 384-bit random value has no brute-forceable structure, so Argon2's deliberate slowness (which defends against guessing low-entropy human secrets) buys nothing and only adds latency.
- **Refresh-token replay detection**: reusing a rotated/revoked token revokes every active session for that user, not just the one presented — treats reuse as a signal of token theft.
- **Refresh token delivery via `httpOnly` + `sameSite=strict` cookie**, scoped to the `/api/v1/auth` path — inaccessible to JS, not sent cross-site, and not exposed to routes that don't need it.
- **Generic invalid-credentials response** — unknown email, wrong password, and inactive/deleted accounts all return the same `AUTH_INVALID_CREDENTIALS` error, preventing account enumeration via response differences.
- **`PermissionsGuard` live-checks `role_permissions` on every gated request** rather than trusting the JWT's `permissions_hash` claim, so a permission revoked mid-session takes effect immediately instead of waiting for token expiry (the hash claim exists for future client-side staleness detection, not as the authorization source of truth).
- **Secure-by-default guard**: routes require authentication unless explicitly opted out with `@Public()` — a new route can't accidentally ship unauthenticated.
- **Cookie `secure` flag is environment-conditional** (`NODE_ENV === "production"`), so local HTTP development still works while production traffic requires TLS.

## 5. Test Coverage

46 new unit tests across 8 spec files (596 lines):

| File | Lines | Covers |
|---|---|---|
| `auth.service.spec.ts` | 211 | login, refresh (incl. replay-revocation), logout, `getCurrentUser` |
| `permissions.guard.spec.ts` | 67 | permission grant/deny paths, no-decorator pass-through |
| `permissions.service.spec.ts` | 70 | role→permission resolution (by id and by name+hospital), hashing |
| `token.service.spec.ts` | 70 | access-token sign/verify, refresh-token generation/hashing |
| `auth.controller.spec.ts` | 82 | all 4 endpoints, cookie set/clear behavior |
| `roles.guard.spec.ts` | 39 | role allow/deny, no-decorator pass-through |
| `jwt-auth.guard.spec.ts` | 33 | `@Public()` bypass, missing/invalid token rejection |
| `password.service.spec.ts` | 24 | Argon2id hash/verify round-trip |

Per the commit message, full workspace build/lint/typecheck/test was green at commit time. Not independently re-run as part of producing this review.

## 6. Known Limitations (Deliberately Out of Scope)

Per `CHANGELOG.md`, deferred rather than forgotten:

- Rate limiting (login brute-force protection)
- Account lockout after repeated failures
- Password reset flow
- Breached-password checks
- MFA logic (schema columns reserved; no TOTP enrollment/verification)
- `GET`/`DELETE /auth/sessions` (session-listing/management endpoints)
- Postgres Row-Level Security / `TenantScopeGuard` for org/hospital scoping (`docs/03_MULTI_TENANT.md` §2) — currently only enforced in application code via JWT claims, not at the database layer
- SSO

## 7. Lessons Learned

- Keeping refresh tokens opaque (not JWTs) simplified revocation: a DB row can be invalidated instantly, whereas a signed refresh JWT would need a separate denylist to revoke before expiry anyway — so there was no benefit to making it a JWT.
- Modeling refresh-token reuse as an explicit replay signal (mass revocation) was cheap to add once rotation existed and closes a real gap: without it, a stolen-but-not-yet-used refresh token would let an attacker and the legitimate user silently coexist.
- Deciding early that `PermissionsGuard` re-queries the database instead of trusting the JWT's `permissions_hash` avoided a stale-authorization bug class (a demoted user keeping old permissions for up to 15 minutes) at the cost of one extra query per permission-gated request — judged acceptable at current scale per `docs/21_NON_FUNCTIONAL_REQUIREMENTS.md`.
- Scoping the refresh cookie to `/api/v1/auth` and marking it `httpOnly`/`sameSite=strict` up front avoided having to retrofit cookie security after a less-restrictive first pass.
- Reserving `mfaEnabled`/`mfaSecret` columns now (schema-only) means the login flow already has its future branch point, so wiring up real MFA later won't require another migration touching the hot-path `User` table.

## 8. Next Sprint Dependencies

Sprint 2 (per `docs/ARCHITECT_AUDIT.md` §Sprint Planning) is not fully closed by Sprint 2.1 alone. Before moving to Sprint 3 (Master Data), the following Sprint 2 items remain and should be sequenced first or explicitly re-scheduled:

- **Postgres Row-Level Security policies** for org/hospital scoping (`docs/03_MULTI_TENANT.md` §2) — currently the *only* tenant isolation is application-level (JWT claims + query filters); RLS is the second, defense-in-depth layer called for by the spec and is not yet in place.
- **Global audit-trail interceptor** wired to real writes (Sprint 1 only shipped a skeleton) — every module built from Sprint 3 onward is expected to be audited per `docs/23_AUDIT_TRAIL.md`, so this should land before or alongside Sprint 3's CRUD work, not after.

Any Sprint 3 work that assumes tenant isolation or audit logging is already enforced at the infrastructure level should not proceed until these are addressed or the assumption is explicitly documented as a known gap.
