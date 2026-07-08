/**
 * Enumerated `{module}.{action}` permission catalog, docs/04_RBAC.md §3. This
 * is the code-level source of truth the doc's §3 refers to
 * ("full enumerated list lives in code") — `docs/04_RBAC.md` §2's table must
 * stay in sync with this file and with `DEFAULT_ROLE_PERMISSIONS` below
 * (per `docs/24_CONFIGURATION.md` §4).
 *
 * Modules mirror the 14 PRD modules. Most modules' engines don't exist until
 * a later sprint (Sprint 3+) — seeding their permission codes now doesn't
 * implement those engines, it only completes the RBAC foundation so every
 * future module's `@RequirePermissions()` has a real, seeded code to point
 * to instead of inventing one ad hoc when that sprint starts.
 *
 * `organization.*`/`hospital.*`/`branch.*` are not in the §2 table (written
 * before tenancy management existed as an API surface) — added here for
 * Sprint 2.2's Organization/Hospital/Branch CRUD, gated the same way as
 * every other module.
 */
export interface PermissionDefinition {
  code: string;
  name: string;
  module: string;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { code: "organization.read", name: "View organizations", module: "organization" },
  { code: "organization.write", name: "Manage organizations", module: "organization" },
  { code: "hospital.read", name: "View hospitals", module: "hospital" },
  { code: "hospital.write", name: "Manage hospitals", module: "hospital" },
  { code: "branch.read", name: "View branches", module: "branch" },
  { code: "branch.write", name: "Manage branches", module: "branch" },

  { code: "master_data.read", name: "View master data", module: "master_data" },
  { code: "master_data.write", name: "Manage master data", module: "master_data" },

  { code: "upload.read", name: "View uploads", module: "upload" },
  { code: "upload.write", name: "Perform uploads", module: "upload" },

  { code: "cost_allocation.read", name: "View cost allocation runs", module: "cost_allocation" },
  { code: "cost_allocation.write", name: "Run cost allocation", module: "cost_allocation" },

  { code: "profitability.read", name: "View profitability results", module: "profitability" },
  { code: "profitability.write", name: "Manage profitability results", module: "profitability" },

  { code: "tariff.read", name: "View tariffs and target margins", module: "tariff" },
  { code: "tariff.write", name: "Set tariffs and target margins", module: "tariff" },
  { code: "tariff.propose", name: "Propose a tariff change", module: "tariff" },
  { code: "tariff.approve", name: "Approve a proposed tariff change", module: "tariff" },

  { code: "doctor_analytics.read", name: "View aggregate/de-identified doctor analytics", module: "doctor_analytics" },
  { code: "doctor_analytics.read_detail", name: "View doctor-identified analytics", module: "doctor_analytics" },

  { code: "ai.use", name: "Use the AI copilot", module: "ai" },
  { code: "ai_proposal.approve", name: "Approve an AI-generated proposal", module: "ai_proposal" },

  { code: "reports.read", name: "View reports", module: "reports" },
  { code: "reports.export", name: "Export reports", module: "reports" },
  { code: "reports.schedule", name: "Schedule recurring reports", module: "reports" },

  { code: "rbac.read", name: "View users, roles, and permissions", module: "rbac" },
  { code: "rbac.write", name: "Manage users, roles, and permissions", module: "rbac" },

  { code: "audit.read", name: "View audit trail", module: "audit" },

  { code: "period_closing.read", name: "View period status", module: "period_closing" },
  { code: "period_closing.write", name: "Close/reopen periods", module: "period_closing" },
];

export const PERMISSION_CODES = PERMISSION_CATALOG.map((permission) => permission.code);
