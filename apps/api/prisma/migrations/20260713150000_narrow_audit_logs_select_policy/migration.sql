-- Narrows the `audit_logs` SELECT policy created in
-- 20260713120000_add_row_level_security. That migration's own comment
-- flagged this as a deliberate but wider-than-necessary trade-off: because
-- Postgres evaluates a table's SELECT policy against the row returned by
-- an INSERT ... RETURNING statement (which Prisma's `.create()` always
-- uses), the original policy had to allow `hospital_id IS NULL`
-- unconditionally just so the INSERT itself (for null-hospital rows)
-- wouldn't fail — which incidentally made EVERY null-hospital audit row
-- readable by ANY hospital-scoped session, not just the row's own
-- organization.
--
-- Investigation (read-only, not committed to code) found two distinct
-- categories of `hospital_id IS NULL` row:
--
-- (a) `POST /organizations` and `POST /hospitals` bootstrap actions taken
--     by an authenticated caller who has no active hospital yet
--     (`User.hospitalId` is nullable by the Sprint 1 model). These rows
--     DO carry a real `user_id` (the acting, authenticated caller) — so
--     they CAN be scoped correctly, via a join back to that user's own
--     `organization_id`, without any schema change.
-- (b) `auth.login` / `auth.refresh` / `auth.logout` rows, written for
--     `@Public()` routes where no authenticated user is attached to the
--     request at all (`AuditInterceptor` never resolves `request.user` on
--     public routes) — `user_id` is NULL for these. There is no
--     organization to join to; these rows are also otherwise inert (no
--     `entity_id`, no `user_id` — nothing identifiable is disclosed by
--     leaving them globally visible to any hospital-scoped session, which
--     remains the residual, accepted trade-off after this migration).
--
-- This migration closes (a) — the more informative category — while
-- leaving (b) as-is, since it can't be closed without either a schema
-- change (an `organization_id` column) or application changes to
-- AuditInterceptor/AuthService (both out of scope here: no
-- schema.prisma change, no application code change).
--
-- The `EXISTS` subquery below reads `users`, which carries its own RLS
-- policy (`organization_id = current_org OR auth_bypass`) — Postgres
-- applies that policy to this subquery too (RLS is not bypassed just
-- because the table is referenced from within another table's policy
-- expression), so the join and `users`' own scoping happen to enforce the
-- same condition twice. That's redundant, not incorrect — it doesn't
-- change what rows are visible, since `hpp_app` isn't the `users` table
-- owner either way.
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
  );
