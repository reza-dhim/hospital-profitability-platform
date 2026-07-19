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
};
