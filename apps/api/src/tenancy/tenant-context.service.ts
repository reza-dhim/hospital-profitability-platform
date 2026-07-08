import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import type { TenantContext } from "./tenant-context";

/**
 * Request-scoped tenant context, carried via `AsyncLocalStorage` rather than
 * Nest DI request-scope (which forces the whole dependency graph of every
 * consumer into request scope, hurting startup/perf). `TenantMiddleware`
 * opens the store per request; `TenantGuard` fills it in once the resolved
 * context is known. Any service can call `get()` without having the request
 * object threaded through every call site — this is the mechanism a future
 * Prisma middleware would use to `SET app.current_org_id` for RLS
 * (docs/03_MULTI_TENANT.md §2), though that RLS wiring itself is not in
 * Sprint 2.2's scope.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<{ context: TenantContext | null }>();

  runWithNewStore<T>(callback: () => T): T {
    return this.storage.run({ context: null }, callback);
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
}
