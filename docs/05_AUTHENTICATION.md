# 05 — Authentication

Status: Draft v1 — resolves the "authentication mechanism unspecified" Critical gap in `ARCHITECT_AUDIT.md`. Authorization (post-authentication) is covered separately in `04_RBAC.md`. Security controls (rate limiting, secrets) in `14_SECURITY.md`.

## 1. Mechanism

- **JWT access token + rotating refresh token**, issued on `POST /auth/login`.
  - Access token: short-lived (15 minutes), signed (RS256), carries `sub` (user id), `org_id`, `active_hospital_id`, `role`, `permissions_hash` (a hash of the resolved permission set, used to short-circuit stale-permission tokens — see §4).
  - Refresh token: long-lived (7 days), opaque random value, stored **hashed** in `refresh_tokens` (per `02_DOMAIN_MODEL.md`), rotated on every use (old token revoked, new one issued) to detect replay.
- Access token delivered to the client and held in memory (not localStorage) by the Next.js app; refresh token delivered as an `httpOnly`, `secure`, `sameSite=strict` cookie. This avoids XSS-based token theft of the long-lived credential.

## 2. Endpoints (extends `API_SPEC.md` §Auth)

| Endpoint | Behavior |
|---|---|
| `POST /auth/login` | email + password → access token (body) + refresh token (Set-Cookie). Rate-limited (see `14_SECURITY.md`). |
| `POST /auth/refresh` | reads refresh cookie → issues new access + rotated refresh token. Fails closed (401) if token reused/revoked/expired. |
| `POST /auth/logout` | revokes the current refresh token, clears cookie. |
| `GET /auth/me` | returns current user, active hospital, resolved role/permissions. |
| `POST /auth/password/forgot` | issues a time-boxed reset token via email (missing from original `API_SPEC.md` — added here). |
| `POST /auth/password/reset` | consumes reset token, sets new password, revokes all existing refresh tokens for that user. |

## 3. Password Policy

- Minimum 12 characters, must not match a breached-password list (checked via k-anonymity API or local list, not sent in plaintext to a third party).
- Bcrypt/argon2id hashing (argon2id preferred) for `users.password_hash`.
- Account lockout: 10 failed attempts within 15 minutes locks the account for 15 minutes and emails the user; lockout events are audit-logged.
- MFA (TOTP) is **not required for MVP** but the `users` schema and login flow must reserve a `mfa_enabled`/`mfa_secret` field and a login-flow branch point, since enterprise hospital IT buyers commonly require it — treated as a fast-follow, not a v1 blocker (see `40_PRODUCT_ROADMAP.md`).

## 4. Permission Freshness

Because access tokens cache a `permissions_hash`, a role/permission change (e.g., admin revokes a user's access) must take effect faster than the 15-minute access-token TTL allows by default. Mitigation: `PermissionsGuard` checks the token's `permissions_hash` against the live-computed hash on every request for **sensitive** modules (tariff approval, RBAC management, doctor detail) and forces a 401 (re-login/refresh) on mismatch; other modules tolerate up to 15-minute staleness as an accepted tradeoff for performance.

## 5. Enterprise SSO (SAML/OIDC)

- Out of scope for MVP implementation, but the login flow is architected with an abstraction (`AuthStrategy` interface in NestJS, via Passport) so SAML/OIDC can be added per-organization without reworking the token model — the JWT issuance step stays the same regardless of how the identity was verified upstream. Tracked in `40_PRODUCT_ROADMAP.md`.

## 6. Session Management

- A user may hold multiple concurrent refresh tokens (multi-device). `GET /auth/sessions` (new endpoint, added here) lists active sessions (device/IP/last-used, from `refresh_tokens.user_agent`/`ip_address`); `DELETE /auth/sessions/:id` revokes a specific session. `System Admin` may force-revoke all sessions for a user (e.g., on offboarding).

## 7. Multi-Tenant Login

- Login is by email (globally unique across the platform) + password, not scoped to an organization subdomain in v1. On login, if a user holds memberships in multiple hospitals (`04_RBAC.md` §4), the response includes the list of accessible hospitals; the frontend prompts a hospital switcher if more than one, defaulting to the last-used hospital (`users.last_active_hospital_id`).
