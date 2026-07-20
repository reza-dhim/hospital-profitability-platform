-- Fixes a gap in the `roles` table's RLS policy from
-- 20260713120000_add_row_level_security. That migration deliberately added
-- an `app.auth_bypass` carve-out to `role_permissions` and `refresh_tokens`
-- specifically because `AuthService.login()`/`refresh()` read them before
-- any tenant context is known (see that migration's own comments on both
-- policies) — but the `roles` table itself was missed, even though
-- `login()`/`refresh()` both do `prisma.user.findUnique({ include: { role:
-- true } })` under the exact same `setAuthBypass()` window, for the exact
-- same reason.
--
-- Effect of the gap: since `app.current_hospital_id` is never set at login
-- time (the hospital isn't known yet — resolving it is literally what
-- login is for) and `roles` had no `auth_bypass` clause, Postgres RLS
-- silently filtered the joined `role` row out of every login/refresh
-- response. `user.role` was therefore always `undefined`, so
-- `user.role?.name ?? null` always produced `null` — every issued JWT's
-- `role` claim has been `null` since that migration, and `PermissionsGuard`
-- (`getPermissionCodesForRoleName(hospitalId, role)`) has been resolving to
-- an empty permission set for literally every authenticated request ever
-- since: every `@RequirePermissions()`-gated endpoint 403s unconditionally.
-- `/auth/me` and other ungated endpoints were unaffected (they re-resolve
-- role from the DB under a normal, already-tenant-scoped session, not
-- under `auth_bypass`), which is why this had gone unnoticed.
DROP POLICY roles_tenant_isolation ON roles;

CREATE POLICY roles_tenant_isolation ON roles
  FOR ALL
  USING (
    hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    OR current_setting('app.auth_bypass', true) = 'on'
  )
  WITH CHECK (
    hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    OR current_setting('app.auth_bypass', true) = 'on'
  );
