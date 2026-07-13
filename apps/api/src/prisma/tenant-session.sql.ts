import { Prisma } from "@prisma/client";
import type { TenantContextService } from "../tenancy/tenant-context.service";

/**
 * The raw statement that sets the transaction-local
 * `app.current_org_id` / `app.current_hospital_id` / `app.auth_bypass` /
 * `app.org_bootstrap` session GUCs the RLS policies in
 * `prisma/migrations/20260713120000_add_row_level_security` reference
 * (docs/03_MULTI_TENANT.md §2). `set_config(name, value, true)` — the
 * `true` (is_local) argument — scopes the value to the current transaction
 * only, discarded on commit/rollback regardless of whether the underlying
 * pooled connection is reused by a later, unrelated request.
 *
 * Shared between `tenant-rls.extension.ts` (which runs this automatically
 * for the overwhelming majority of calls — anything not already inside an
 * application-managed transaction) and the small number of services that
 * open their own explicit `$transaction` (`TariffService.create`,
 * `RoleService`'s permission sync): Prisma doesn't support nested
 * interactive transactions, and today's client extensions have no reliable
 * way to detect "this operation is already running inside one" from
 * within `$allOperations` — see the extension's doc comment. Those two
 * places run this statement themselves, once, as the first statement of
 * their own transaction.
 */
export function tenantSessionSql(tenantContextService: TenantContextService): Prisma.Sql {
  const tenant = tenantContextService.get();
  const authBypass = tenantContextService.isAuthBypass();
  const orgBootstrap = tenantContextService.isOrgBootstrap();
  return Prisma.sql`SELECT
    set_config('app.current_org_id', ${tenant?.organizationId ?? ""}, true),
    set_config('app.current_hospital_id', ${tenant?.hospitalId ?? ""}, true),
    set_config('app.auth_bypass', ${authBypass ? "on" : ""}, true),
    set_config('app.org_bootstrap', ${orgBootstrap ? "on" : ""}, true)`;
}
