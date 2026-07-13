-- docs/03_MULTI_TENANT.md §2 (Isolation Model: Defense in Depth) and
-- docs/14_SECURITY.md §5 (Tenant Isolation) / §6 (Audit Log Integrity).
--
-- This migration must be applied by the schema OWNER role (the same role
-- Prisma's `DATABASE_URL` already uses for `migrate deploy`/`migrate dev` —
-- see apps/api/.env.example). Postgres table owners always bypass
-- non-FORCE row-level security, so the owner role is deliberately left
-- alone here: it is the migration/seed bypass path, not a gap.
--
-- A second, non-owner role (`hpp_app`) is created for the *running
-- application* (`APP_DATABASE_URL`). Only that role is subject to the
-- policies below.

-- --- 1. Application runtime role -------------------------------------------
-- Local/CI password matches the existing plaintext dev-credential convention
-- (`hpp`/`hpp` in docker-compose.yml and CI). Production must rotate this via
-- `ALTER ROLE hpp_app PASSWORD '...'` as part of the secrets rotation
-- process (docs/14_SECURITY.md §1, docs/29_DEPLOYMENT.md) — a migration
-- file cannot carry a real production secret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hpp_app') THEN
    CREATE ROLE hpp_app LOGIN PASSWORD 'hpp_app';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hpp_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO hpp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hpp_app;

-- Any table a future migration creates (run by the owner role) is
-- automatically granted to hpp_app too, without needing to repeat this
-- GRANT block in every subsequent migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hpp_app;

-- docs/14_SECURITY.md §6: audit_logs is append-only at the DB layer, not
-- just the application layer — no code path (and now no DB grant) can
-- UPDATE or DELETE an audit row for the app's runtime role.
REVOKE UPDATE, DELETE ON audit_logs FROM hpp_app;

-- --- 2. Row Level Security ---------------------------------------------
-- Session GUCs are set per-operation by the Prisma client extension
-- (apps/api/src/prisma/tenant-rls.extension.ts) via
-- `set_config('app.current_org_id' | 'app.current_hospital_id' | 'app.auth_bypass', <value>, true)`
-- — transaction-local (`is_local = true`), so a value never survives past
-- the transaction that set it, regardless of connection-pool reuse.
--
-- `current_setting(name, true)` (missing_ok = true) returns NULL instead of
-- erroring when a GUC was never set on a session at all. Comparing a
-- column to NULL is never true in SQL, so a request that never resolved a
-- tenant context (or a stray direct DB session) sees zero rows — fails
-- closed, never "all rows" (docs/03_MULTI_TENANT.md §2 rationale).
-- `NULLIF(current_setting(...), '')` additionally treats the empty-string
-- sentinel (used when no hospital is active, e.g. an org-level session) the
-- same way as "unset".

-- --- 2a. organizations: root tenant, no parent scope ---------------------
-- INSERT is intentionally unrestricted: `OrganizationService.create()`
-- bootstraps a brand-new organization for an authenticated caller who, by
-- definition, cannot already have that new org's id as their
-- `current_org_id` (docs/03_MULTI_TENANT.md §3 — no platform-admin
-- onboarding surface exists yet, so this is today's only creation path).
-- SELECT/UPDATE/DELETE additionally allow `app.org_bootstrap`: Postgres
-- evaluates a table's SELECT policy against the newly-inserted row when a
-- statement uses RETURNING (which Prisma's `.create()` always does), so
-- even with INSERT unconditionally permissive, reading the just-created
-- org back in the same statement would otherwise fail. `app.org_bootstrap`
-- is set only by `OrganizationService.create()`, transaction-local — every
-- other operation on this table stays scoped to the caller's own
-- organization.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select ON organizations
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.org_bootstrap', true) = 'on'
  );

CREATE POLICY organizations_insert ON organizations
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY organizations_update ON organizations
  FOR UPDATE
  USING (
    id = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.org_bootstrap', true) = 'on'
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.org_bootstrap', true) = 'on'
  );

CREATE POLICY organizations_delete ON organizations
  FOR DELETE
  USING (
    id = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.org_bootstrap', true) = 'on'
  );

-- --- 2b. Organization-scoped tables ---------------------------------------
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY hospitals_tenant_isolation ON hospitals
  FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), ''));

-- `users`: additionally allows `app.auth_bypass` for the login/refresh/
-- logout flow, which must look a user up *before* any tenant is known
-- (docs/05_AUTHENTICATION.md — email is the login identifier, tenant is
-- derived from the user found, not known in advance). Set only by
-- `AuthService` (`TenantContextService.setAuthBypass()`), transaction-local,
-- never a general-purpose bypass.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.auth_bypass', true) = 'on'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.auth_bypass', true) = 'on'
  );

-- --- 2c. Hospital-scoped tables --------------------------------------------
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_tenant_isolation ON branches
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant_isolation ON roles
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE user_hospital_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_hospital_memberships_tenant_isolation ON user_hospital_memberships
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_centers_tenant_isolation ON cost_centers
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE profit_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY profit_centers_tenant_isolation ON profit_centers
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY drivers_tenant_isolation ON drivers
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE allocation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY allocation_rules_tenant_isolation ON allocation_rules
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE coa_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY coa_accounts_tenant_isolation ON coa_accounts
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctors_tenant_isolation ON doctors
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY services_tenant_isolation ON services
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_tenant_isolation ON employees
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY assets_tenant_isolation ON assets
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_tenant_isolation ON vendors
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE bmhp_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY bmhp_items_tenant_isolation ON bmhp_items
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE tariffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tariffs_tenant_isolation ON tariffs
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE hospital_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY hospital_settings_tenant_isolation ON hospital_settings
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

-- --- 2d. Tables without a direct tenant column (EXISTS-join) --------------
-- role_permissions: scoped via roles.hospital_id. Also allows
-- `app.auth_bypass` — `PermissionsService.getPermissionCodes()` is called
-- from `AuthService.issueTokens()` during login/refresh, before any tenant
-- context is resolved.
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_tenant_isolation ON role_permissions
  FOR ALL
  USING (
    current_setting('app.auth_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM roles
      WHERE roles.id = role_permissions.role_id
        AND roles.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.auth_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM roles
      WHERE roles.id = role_permissions.role_id
        AND roles.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  );

-- refresh_tokens: scoped via users.organization_id. `app.auth_bypass`
-- covers the same pre-tenant-known login/refresh/logout lookups (by token
-- hash) and the refresh-token row created at the end of `issueTokens()`.
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY refresh_tokens_tenant_isolation ON refresh_tokens
  FOR ALL
  USING (
    current_setting('app.auth_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = refresh_tokens.user_id
        AND users.organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.auth_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = refresh_tokens.user_id
        AND users.organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    )
  );

-- --- 2e. audit_logs: nullable hospital_id ----------------------------------
-- `hospital_id` is NULL for `@Public()` routes (login/refresh/logout) and
-- for authenticated-but-hospital-less actions (e.g. `POST /organizations`)
-- that have no resolved hospital. INSERT allows `hospital_id IS NULL` so
-- the audit interceptor's existing
-- `hospitalId: request.tenantContext?.hospitalId ?? null` write keeps
-- working on those routes. SELECT must allow the same — Postgres evaluates
-- the SELECT policy against the new row for any RETURNING statement
-- (Prisma's `.create()` always uses one), so a stricter SELECT policy would
-- make every null-hospital insert fail, not just later reads. The
-- consequence: any hospital-scoped session can read null-hospital audit
-- rows from *any* organization, not just its own — `audit_logs` has no
-- `organization_id` column to scope by (docs/02_DOMAIN_MODEL.md's schema),
-- and these rows are narrow in practice (auth attempts, org bootstrap
-- actions), but this is a real, deliberate trade-off, not an oversight.
-- No UPDATE/DELETE policy is defined: the REVOKE above already denies
-- those statements to `hpp_app` at the grant level, before RLS would even
-- be evaluated.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT
  USING (
    hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    OR hospital_id IS NULL
  );

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (
    hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    OR hospital_id IS NULL
  );

-- --- 2f. permissions: global read-only catalog -----------------------------
-- Not tenant-scoped by design (docs/02_DOMAIN_MODEL.md — shared
-- `{module}.{action}` catalog across every hospital); intentionally left
-- without RLS.
