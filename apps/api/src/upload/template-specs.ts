import { UploadType } from "@prisma/client";

/** docs/06_UPLOAD_ENGINE.md §1: "Each template is versioned... so the engine can detect and reject uploads against a stale template." */
export const TEMPLATE_VERSION = "v1";

export interface TemplateColumn {
  /** Visible header text (row 2 of the generated sheet) and the column name the parser (Sprint 4 sub-task 4) matches against. */
  header: string;
}

export interface TemplateSpec {
  columns: TemplateColumn[];
}

/**
 * One entry per `SUPPORTED_UPLOAD_TYPES` value (`upload.constants.ts`).
 * Columns reference master-data by human-readable *code*, not internal id
 * (`cost_center_code`, not `cost_center_id`) — matches
 * docs/07_VALIDATION_ENGINE.md §2's error taxonomy, which is itself written
 * in terms of codes (`E_INVALID_COST_CENTER`: "cost_center code not found").
 * Shared between `TemplateService` (generation, this sub-task) and the
 * parser (structural validation, Sprint 4 sub-task 4) so the two can never
 * drift apart.
 */
export const TEMPLATE_SPECS: Partial<Record<UploadType, TemplateSpec>> = {
  cost: {
    columns: [
      { header: "period" },
      { header: "cost_center_code" },
      { header: "coa_account_code" },
      { header: "nominal" },
    ],
  },
  revenue: {
    columns: [
      { header: "period" },
      { header: "profit_center_code" },
      { header: "service_code" },
      { header: "volume" },
      { header: "revenue" },
    ],
  },
  /**
   * Sprint 5 sub-task 0 — feeds the Cost Allocation Engine's driver
   * percentages (docs/08_COST_ALLOCATION_ENGINE.md §2). `target_type` is
   * `cost_center` or `profit_center` (docs/02_DOMAIN_MODEL.md's
   * `driver_values.target_center_id` has no discriminator in the literal
   * schema — `target_type` + `target_code` together replace it, resolved
   * to the real polymorphic FK pair at confirm time).
   */
  driver: {
    columns: [
      { header: "period" },
      { header: "driver_code" },
      { header: "target_type" },
      { header: "target_code" },
      { header: "value" },
    ],
  },
  /**
   * Master-data upload types (this sub-task) — no `period` column, since
   * Asset/Employee/BmhpItem/Tariff aren't period-scoped entities
   * (`upload_batches.period_id` still gates "is this hospital's data-entry
   * window open", it just isn't written onto the promoted row). Insert-only:
   * a `code` that already exists among live rows is a validation error, not
   * an update — see `row-validation-rules.ts`'s `codeNotExistsRule`.
   */
  asset: {
    columns: [
      { header: "code" },
      { header: "name" },
      { header: "category" },
      { header: "cost_center_code" },
      { header: "acquisition_cost" },
      { header: "depreciation_method" },
      { header: "useful_life_months" },
    ],
  },
  employee: {
    columns: [
      { header: "code" },
      { header: "name" },
      { header: "role_title" },
      { header: "department_cost_center_code" },
      { header: "employment_type" },
    ],
  },
  bmhp: {
    columns: [
      { header: "code" },
      { header: "name" },
      { header: "unit" },
      { header: "standard_cost" },
      { header: "vendor_code" },
    ],
  },
  /**
   * No `code`/duplicate check — `tariffs` is an append-only history per
   * `service_code` by design (docs/02_DOMAIN_MODEL.md's `tariffs` note).
   * Each valid row is always a new insert that supersedes the prior active
   * tariff for that service, same as `TariffService.create()`.
   */
  tariff: {
    columns: [
      { header: "service_code" },
      { header: "current_tariff" },
      { header: "recommended_tariff" },
      { header: "effective_date" },
    ],
  },
  /**
   * Sprint 8 prerequisite — period-scoped, append-only case-level data
   * (docs/11_DOCTOR_ANALYTICS.md §2), same pipeline shape as cost/revenue/
   * driver above, not the insert-only master-data shape used by
   * asset/employee/bmhp/tariff. One row = one activity/case instance —
   * many rows legitimately share the same period+service_code+doctor_code,
   * which is why there's no natural-key duplicate check for this type
   * (row-validation-rules.ts).
   */
  medical_activity: {
    columns: [
      { header: "period" },
      { header: "service_code" },
      { header: "doctor_code" },
      { header: "volume" },
      { header: "duration_minutes" },
      { header: "bmhp_cost" },
      { header: "room_cost" },
      { header: "staff_cost" },
      { header: "revenue" },
    ],
  },
};
