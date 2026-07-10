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
  before?: unknown;
  after?: unknown;
}
