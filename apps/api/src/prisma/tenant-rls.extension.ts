import { Prisma } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantSessionSql } from "./tenant-session.sql";

/**
 * Sets the transaction-local tenant session GUCs (see `tenant-session.sql.ts`)
 * that the RLS policies in
 * `prisma/migrations/20260713120000_add_row_level_security` reference
 * (docs/03_MULTI_TENANT.md §2). Applied per Prisma *model* operation (not
 * `$allOperations` at the client root) so this handler is never re-entered
 * by its own `$executeRaw` call for `set_config` — raw queries aren't model
 * operations and don't recurse back through `$allModels`.
 *
 * Uses the function form of `Prisma.defineExtension((prisma) => ...)` — per
 * Prisma's own client-extension examples — so `$transaction`/`$executeRaw`
 * are called on the closed-over top-level client rather than on `this`.
 *
 * Two shapes of caller:
 * - Top-level client calls (the overwhelming majority — e.g.
 *   `MasterDataCrudService`'s delegate calls): wrapped here in a
 *   2-statement sequential `$transaction([setSession, query(args)])` so
 *   both run on the same connection. `set_config(name, value, true)` — the
 *   `true` (is_local) argument — scopes the value to that transaction only,
 *   discarded on commit/rollback regardless of whether the underlying
 *   pooled connection is reused by a later, unrelated request.
 * - Calls already inside an application-managed interactive transaction
 *   (`TariffService.create`'s tariff-supersede logic, `RoleService`'s
 *   permission sync): Prisma doesn't support nested interactive
 *   transactions, so this handler must not try to open another one for
 *   them. `TenantContextService.isManagedTransaction()` (set explicitly by
 *   those two call sites around their own `$transaction`) is how this is
 *   detected — checking `this.$transaction`'s existence inside
 *   `$allOperations`, the more "automatic" approach, was tried first and
 *   confirmed empirically (via this migration's integration suite) to not
 *   reliably distinguish top-level from nested calls in Prisma 5.22. Those
 *   two call sites set the session GUCs themselves, once, as the first
 *   statement of their own transaction (`tenantSessionSql`) — every later
 *   statement in the same transaction sees it without this extension
 *   needing to do anything.
 */
export function tenantRlsExtension(tenantContextService: TenantContextService) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      name: "tenant-rls",
      query: {
        $allModels: {
          $allOperations({ args, query }) {
            const tenant = tenantContextService.get();
            const authBypass = tenantContextService.isAuthBypass();
            if (!tenant && !authBypass) {
              return query(args);
            }

            if (tenantContextService.isManagedTransaction()) {
              return query(args);
            }

            return prisma
              .$transaction([prisma.$executeRaw(tenantSessionSql(tenantContextService)), query(args)])
              .then(([, result]) => result);
          },
        },
      },
    })
  );
}
