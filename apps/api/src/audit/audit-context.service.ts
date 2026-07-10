import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditRecord } from "./audit-context";

/**
 * Request-scoped audit payload, carried via `AsyncLocalStorage` — same
 * rationale as `TenantContextService` (tenancy/tenant-context.service.ts):
 * avoids forcing every CRUD service into Nest's request scope just so it can
 * hand a before/after diff to the interceptor that persists it.
 *
 * `AuditInterceptor` opens the store (via `runWithNewStore`) around the
 * request; the generic CRUD engine (`common/crud`) calls `record()` once it
 * has fetched the pre-mutation row and computed the post-mutation result;
 * `AuditInterceptor` reads `get()` back after the handler completes. This is
 * the single cooperation point between the generic interceptor and services —
 * everything else about persisting the entry (user, ip, timestamp) stays in
 * the interceptor per docs/23_AUDIT_TRAIL.md §3 ("one interceptor... not
 * scattered manual calls").
 */
@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<{ record: AuditRecord | null }>();

  runWithNewStore<T>(callback: () => T): T {
    return this.storage.run({ record: null }, callback);
  }

  record(entry: AuditRecord): void {
    const store = this.storage.getStore();
    // No-op outside a request the interceptor opened a store for (e.g. unit
    // tests calling a service directly) — audit writes are best-effort
    // enrichment, never a reason to fail the underlying business operation.
    if (!store) return;
    store.record = entry;
  }

  get(): AuditRecord | null {
    return this.storage.getStore()?.record ?? null;
  }
}
