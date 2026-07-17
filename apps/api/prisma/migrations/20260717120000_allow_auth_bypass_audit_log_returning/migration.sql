-- Extends the `audit_logs_select` policy (narrowed by
-- 20260713150000_narrow_audit_logs_select_policy) to also allow
-- `app.auth_bypass` — the same pre-tenant escape hatch already used by the
-- `users` / `refresh_tokens` / `role_permissions` policies in
-- 20260713120000_add_row_level_security, for the identical reason: the
-- login/refresh/logout flow authenticates a user (and, from that point on,
-- knows their real `user_id`) before any tenant context
-- (`app.current_org_id`) is ever set for that request's transaction.
--
-- Without this clause, AuthService's new `auth.login.success` /
-- `auth.refresh` / `auth.logout` audit rows (docs/23_AUDIT_TRAIL.md §3) —
-- which now correctly carry the real, non-null acting `user_id` instead of
-- always NULL — fail to write at all. Prisma's `.create()` always issues
-- `INSERT ... RETURNING`, and Postgres evaluates a table's SELECT policy
-- against the newly-inserted row for any RETURNING statement. The existing
-- SELECT policy's `hospital_id IS NULL` branch requires an `EXISTS` join
-- proving `users.organization_id = current_org`, but `app.current_org_id`
-- is never set during the auth flow — only `app.auth_bypass` is — so every
-- one of the policy's branches evaluated false and the INSERT was rejected
-- with "new row violates row-level security policy for table audit_logs",
-- even though the INSERT's own WITH CHECK clause (which only constrains
-- `hospital_id`, not `user_id`) was satisfied.
--
-- `app.auth_bypass` is set only by `AuthService`
-- (`TenantContextService.setAuthBypass()`), transaction-local (see
-- `tenant-session.sql.ts`) — this clause only ever applies within that same
-- login/refresh/logout write's own transaction, not to any later read of
-- the row (a subsequent `GET /audit-logs` request never sets
-- `app.auth_bypass`), so this does not widen who can *read* these rows
-- afterwards — only what the write's own RETURNING statement can observe.
DROP POLICY audit_logs_select ON audit_logs;

CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT
  USING (
    hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    OR (
      hospital_id IS NULL
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = audit_logs.user_id
          AND users.organization_id = NULLIF(current_setting('app.current_org_id', true), '')
      )
    )
    OR (hospital_id IS NULL AND user_id IS NULL)
    OR current_setting('app.auth_bypass', true) = 'on'
  );
