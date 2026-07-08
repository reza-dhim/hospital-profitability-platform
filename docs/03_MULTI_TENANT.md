# 03 — Multi-Tenancy Model

Status: Draft v1 — resolves the "multi-tenancy model undefined" Critical gap in `ARCHITECT_AUDIT.md`. Builds on `02_DOMAIN_MODEL.md` and `01_BUSINESS_RULES.md` §1. Enforcement details for RBAC scoping are in `04_RBAC.md`; security posture in `14_SECURITY.md`.

## 1. Tenancy Hierarchy

```
organization  (top-level tenant — a hospital group or single-hospital operator)
  └─ hospital   (financial/costing unit — owns all master data)
       └─ branch  (physical site — optional finer-grained tagging of transactions)
```

- **organization** is the billing/subscription tenant boundary.
- **hospital** is the data-ownership boundary for master data (cost centers, profit centers, drivers, services, doctors, tariffs — see `01_BUSINESS_RULES.md` §1). All allocation runs execute at hospital scope.
- **branch** is optional metadata on transactional rows (`cost_entries`, `revenue_entries`, `medical_activities`) for multi-site hospitals that want branch-level drill-down without maintaining separate cost/profit center structures. Branch-level reporting is a filter on hospital-level results, not a separate calculation.

## 2. Isolation Model: Defense in Depth

Two enforcement layers, both mandatory — neither is trusted alone:

1. **Application layer**: every NestJS request is scoped by the authenticated user's `organization_id` (and `hospital_id` where applicable) via a global `TenantScopeGuard` + `TenantContextInterceptor` that injects the tenant filter into every Prisma query at the repository layer.
2. **Database layer — Postgres Row-Level Security (RLS)**: every tenant-scoped table has an RLS policy keyed on `organization_id` (and `hospital_id` for hospital-scoped tables). The application sets `SET app.current_org_id`, `SET app.current_hospital_id` as session variables at the start of each request (via a Prisma middleware/interceptor), and RLS policies reference `current_setting('app.current_org_id')`.

Rationale (per `ARCHITECT_AUDIT.md` Engineering Recommendation): this is financial and doctor-performance data; a single missed `WHERE` clause in application code must not be able to leak cross-tenant data. RLS is the backstop.

## 3. Superuser / Platform-Admin Access

- A distinct `platform_admin` role (not part of any organization's RBAC — see `04_RBAC.md`) exists for platform operations (support, billing, migrations). Platform admins access tenant data only via an explicit, audited "impersonate/support session" flow that is itself logged to `audit_logs` with a mandatory reason field. Direct unscoped DB access is restricted to infrastructure operators, not application users.

## 4. Cross-Hospital Access (Organization-Level Roles)

- A user's `role` is assigned **per hospital membership**, not globally. A user with access to multiple hospitals in the same organization (e.g., a group-level Direktur) holds one `users` row per hospital membership, or a `user_hospital_memberships` join table (see `04_RBAC.md` §4) associating one identity to multiple hospital-scoped roles.
- There is no "see all hospitals unfiltered" view in v1; a multi-hospital user switches active hospital context (hospital switcher in the top bar) and all queries scope to the selected hospital. A cross-hospital rollup dashboard is out of scope for MVP (candidate for `40_PRODUCT_ROADMAP.md` Phase 2).

## 5. New Hospital Onboarding

- Creating a new `hospital` under an `organization` is a `System Admin` action (organization-level admin). It triggers the onboarding wizard described in `UX_ONBOARDING_GUIDE.md` and seeds `hospital_settings` with defaults (see `24_CONFIGURATION.md`).
- Master data is never pre-populated across hospitals automatically; a "copy structure from another hospital" convenience action is available (see `24_CONFIGURATION.md`) but always produces an independent, editable copy.

## 6. Data Residency & Isolation Testing

- All tenant data resides in a single shared Postgres instance/schema (not schema-per-tenant, not database-per-tenant) for MVP — operationally simpler at expected scale (see `21_NON_FUNCTIONAL_REQUIREMENTS.md` for volume assumptions). Schema-per-tenant is a documented escape hatch if a specific enterprise customer's contract requires physical isolation.
- Tenant isolation is covered by a mandatory automated test suite (`33_TESTING_STRATEGY.md` §Tenant Isolation Tests) that asserts no query path can return another tenant's rows, run on every PR touching a Prisma model or RLS policy.
