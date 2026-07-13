import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import type { TenantContext } from "./tenant-context";

interface TenantStore {
  context: TenantContext | null;
  /**
   * Set only by `AuthService` (login/refresh/logout), which must look up a
   * `User`/`RefreshToken` row *before* any tenant is known — the whole point
   * of login is discovering the tenant from the row found, not the other
   * way around. Read by the Prisma RLS extension
   * (`apps/api/src/prisma/tenant-rls.extension.ts`) to set the
   * transaction-local `app.auth_bypass` session GUC referenced by the
   * `users`/`refresh_tokens`/`role_permissions` RLS policies
   * (docs/03_MULTI_TENANT.md §2). Never read anywhere else — this is a
   * narrow, auditable escape hatch, not a general bypass.
   */
  authBypass: boolean;
  /**
   * True only while `TariffService.create()` / `RoleService.assignPermissions()`
   * are running their own explicit `$transaction` (docs/03_MULTI_TENANT.md
   * §2). Read by the tenant-rls Prisma extension to skip its normal
   * per-operation wrapping for operations issued inside that transaction —
   * Prisma doesn't support nested interactive transactions, and querying
   * `this.$transaction` from inside `$allOperations` to detect "already in a
   * transaction" is not reliable (confirmed empirically: it doesn't
   * distinguish top-level from nested calls). Those two call sites set the
   * session GUCs themselves instead, once, as the first statement of their
   * own transaction — see `tenant-rls.extension.ts`'s doc comment.
   */
  managedTransaction: boolean;
  /**
   * Set only by `OrganizationService.create()`. Postgres evaluates a
   * table's SELECT policy against the newly-inserted row when a statement
   * uses `RETURNING` (which Prisma's `.create()` always does) — so even
   * though `organizations`' INSERT policy is unconditionally permissive
   * (docs/03_MULTI_TENANT.md §3: bootstrapping a new org can't already have
   * that org's id as the caller's own `current_org_id`), the plain SELECT
   * policy would still reject reading the row back in the same statement.
   * This narrow flag is the escape hatch for exactly that RETURNING
   * check — never anything broader; `organizations` SELECT/UPDATE/DELETE
   * everywhere else stays scoped to the caller's own organization.
   */
  orgBootstrap: boolean;
}

/**
 * Request-scoped tenant context, carried via `AsyncLocalStorage` rather than
 * Nest DI request-scope (which forces the whole dependency graph of every
 * consumer into request scope, hurting startup/perf). `TenantMiddleware`
 * opens the store per request (including `@Public()` routes); `TenantGuard`
 * fills it in once the resolved context is known for every other route. Any
 * service can call `get()` without having the request object threaded
 * through every call site — this is the mechanism the Prisma RLS extension
 * uses to `set_config('app.current_org_id', ...)` for RLS
 * (docs/03_MULTI_TENANT.md §2).
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  runWithNewStore<T>(callback: () => T): T {
    return this.storage.run(
      { context: null, authBypass: false, managedTransaction: false, orgBootstrap: false },
      callback
    );
  }

  set(context: TenantContext): void {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error("TenantContextService.set called outside of TenantMiddleware's store.");
    }
    store.context = context;
  }

  get(): TenantContext | null {
    return this.storage.getStore()?.context ?? null;
  }

  setAuthBypass(): void {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error("TenantContextService.setAuthBypass called outside of TenantMiddleware's store.");
    }
    store.authBypass = true;
  }

  isAuthBypass(): boolean {
    return this.storage.getStore()?.authBypass ?? false;
  }

  setManagedTransaction(value: boolean): void {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error("TenantContextService.setManagedTransaction called outside of TenantMiddleware's store.");
    }
    store.managedTransaction = value;
  }

  isManagedTransaction(): boolean {
    return this.storage.getStore()?.managedTransaction ?? false;
  }

  setOrgBootstrap(): void {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error("TenantContextService.setOrgBootstrap called outside of TenantMiddleware's store.");
    }
    store.orgBootstrap = true;
  }

  isOrgBootstrap(): boolean {
    return this.storage.getStore()?.orgBootstrap ?? false;
  }
}
