/**
 * What a mutating request wants recorded to `audit_logs` (docs/23_AUDIT_TRAIL.md §2).
 * `entity`/`action` mirror the table name and a `{entity}.{verb}` action code;
 * `entityId`/`before`/`after` are optional because a create has no "before"
 * state and a bulk operation may not have a single entity id.
 */
export interface AuditRecord {
  entity: string;
  action: string;
  entityId?: string | null;
  /**
   * Explicit actor override for routes the interceptor can't attribute via
   * `request.user` — namely `@Public()` auth routes (login/refresh/logout),
   * where `JwtAuthGuard` never runs so `request.user` is never populated
   * even after a successful login. `undefined` (the default, every existing
   * CRUD call site) means "let the interceptor derive it from
   * `request.user?.sub`"; `null` means "explicitly no actor" (e.g. a login
   * attempt against an email that matches no user).
   */
  userId?: string | null;
  before?: unknown;
  after?: unknown;
}
