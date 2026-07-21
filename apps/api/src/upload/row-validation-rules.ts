import { UploadType } from "@prisma/client";
import { ValidationIssue, parseNumeric } from "./validation-issue";

export interface MasterDataLookup {
  costCenterCodes: Set<string>;
  coaAccountCodes: Set<string>;
  profitCenterCodes: Set<string>;
  driverCodes: Set<string>;
  /** service_code -> the code of that service's configured profit center (for `E_MAPPING_MISMATCH`). Also doubles as a plain service-code existence lookup (`Map.has()` works the same as `Set.has()`) for `tariff` uploads. */
  serviceProfitCenter: Map<string, string>;
  vendorCodes: Set<string>;
  /** Live (non-deleted) codes for the insert-only master-data upload types — `codeNotExistsRule` checks against these so a row that duplicates an existing code fails validation with a clean message instead of a raw unique-constraint error at confirm time. */
  assetCodes: Set<string>;
  employeeCodes: Set<string>;
  bmhpItemCodes: Set<string>;
  doctorCodes: Set<string>;
}

const TARGET_TYPES = ["cost_center", "profit_center"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

export type RowRule = (
  raw: Record<string, string | number | null>,
  periodLabel: string,
  lookup: MasterDataLookup
) => ValidationIssue[];

const PERIOD_LABEL_PATTERN = /^\d{4}-\d{2}$/;

function isEmpty(value: string | number | null): boolean {
  return value === null || value === "";
}

function requiredFieldsRule(fields: string[]): RowRule {
  return (raw) =>
    fields
      .filter((field) => isEmpty(raw[field] ?? null))
      .map((field) => ({
        errorCode: "E_MISSING_VALUE",
        columnName: field,
        message: `'${field}' is required.`,
        severity: "error" as const,
      }));
}

/** Row `period` must be a well-formed label AND match the upload's own target period — a batch always targets exactly one period. */
function periodRule(): RowRule {
  return (raw, periodLabel) => {
    const value = raw.period;
    if (isEmpty(value ?? null)) return []; // already flagged by E_MISSING_VALUE
    if (typeof value !== "string" || !PERIOD_LABEL_PATTERN.test(value)) {
      return [
        {
          errorCode: "E_INVALID_TYPE",
          columnName: "period",
          message: `'${String(value)}' is not a valid period label (expected YYYY-MM).`,
          severity: "error",
        },
      ];
    }
    if (value !== periodLabel) {
      return [
        {
          errorCode: "E_INVALID_PERIOD",
          columnName: "period",
          message: `Row period '${value}' does not match this upload's target period '${periodLabel}'.`,
          severity: "error",
        },
      ];
    }
    return [];
  };
}

function numericFieldRule(field: string): RowRule {
  return (raw) => {
    const value = raw[field];
    if (isEmpty(value ?? null)) return [];
    if (parseNumeric(value ?? null) === null) {
      return [
        {
          errorCode: "E_INVALID_TYPE",
          columnName: field,
          message: `'${field}' value '${String(value)}' is not a valid number.`,
          severity: "error",
        },
      ];
    }
    return [];
  };
}

function zeroValueRule(field: string): RowRule {
  return (raw) => {
    const parsed = parseNumeric(raw[field] ?? null);
    if (parsed === 0) {
      return [{ errorCode: "W_ZERO_VALUE", columnName: field, message: `'${field}' is zero.`, severity: "warning" }];
    }
    return [];
  };
}

function codeExistsRule(field: string, errorCode: string, lookupKey: keyof MasterDataLookup): RowRule {
  return (raw, _periodLabel, lookup) => {
    const value = raw[field];
    if (isEmpty(value ?? null)) return [];
    const container = lookup[lookupKey] as Set<string> | Map<string, string>;
    if (!container.has(String(value))) {
      return [{ errorCode, columnName: field, message: `${field} '${String(value)}' not found.`, severity: "error" }];
    }
    return [];
  };
}

/** Inverse of `codeExistsRule` — for insert-only master-data uploads (asset/employee/bmhp), a `code` that already exists live is a validation error, not something to upsert over. */
function codeNotExistsRule(field: string, errorCode: string, lookupKey: keyof MasterDataLookup): RowRule {
  return (raw, _periodLabel, lookup) => {
    const value = raw[field];
    if (isEmpty(value ?? null)) return [];
    const container = lookup[lookupKey] as Set<string>;
    if (container.has(String(value))) {
      return [
        {
          errorCode,
          columnName: field,
          message: `${field} '${String(value)}' already exists — this upload type is insert-only; edit the existing row via Master Data instead.`,
          severity: "error",
        },
      ];
    }
    return [];
  };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isoDateRule(field: string): RowRule {
  return (raw) => {
    const value = raw[field];
    if (isEmpty(value ?? null)) return []; // already flagged by E_MISSING_VALUE if required
    if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
      return [
        {
          errorCode: "E_INVALID_TYPE",
          columnName: field,
          message: `'${field}' value '${String(value)}' is not a valid date (expected YYYY-MM-DD).`,
          severity: "error",
        },
      ];
    }
    return [];
  };
}

/** e.g. a revenue row references a `service` whose configured `profit_center` doesn't match the row's own `profit_center_code`. */
function mappingMismatchRule(): RowRule {
  return (raw, _periodLabel, lookup) => {
    const serviceCode = raw.service_code;
    const profitCenterCode = raw.profit_center_code;
    if (isEmpty(serviceCode ?? null) || isEmpty(profitCenterCode ?? null)) return [];
    const configured = lookup.serviceProfitCenter.get(String(serviceCode));
    if (configured === undefined) return []; // unknown service — already flagged by E_INVALID_SERVICE
    if (configured !== String(profitCenterCode)) {
      return [
        {
          errorCode: "E_MAPPING_MISMATCH",
          columnName: "profit_center_code",
          message: `Service '${String(serviceCode)}' is configured under profit center '${configured}', not '${String(profitCenterCode)}'.`,
          severity: "error",
        },
      ];
    }
    return [];
  };
}

/** `target_type` must be one of the two polymorphic-target discriminator values (`DriverValue.targetCostCenterId`/`targetProfitCenterId`, Sprint 5 sub-task 0). */
function targetTypeRule(): RowRule {
  return (raw) => {
    const value = raw.target_type;
    if (isEmpty(value ?? null)) return []; // already flagged by E_MISSING_VALUE
    if (!TARGET_TYPES.includes(String(value) as TargetType)) {
      return [
        {
          errorCode: "E_INVALID_TYPE",
          columnName: "target_type",
          message: `'target_type' must be one of ${TARGET_TYPES.join(", ")}, got '${String(value)}'.`,
          severity: "error",
        },
      ];
    }
    return [];
  };
}

/** `target_code` is validated against `costCenterCodes` or `profitCenterCodes` depending on the row's own `target_type` — a single field can't pick a fixed lookup the way `codeExistsRule` does. */
function targetCodeExistsRule(): RowRule {
  return (raw, _periodLabel, lookup) => {
    const targetType = raw.target_type;
    const targetCode = raw.target_code;
    if (isEmpty(targetCode ?? null)) return [];
    if (!TARGET_TYPES.includes(String(targetType) as TargetType)) return []; // already flagged by targetTypeRule

    if (targetType === "cost_center") {
      if (!lookup.costCenterCodes.has(String(targetCode))) {
        return [
          {
            errorCode: "E_INVALID_COST_CENTER",
            columnName: "target_code",
            message: `target_code '${String(targetCode)}' not found among cost centers.`,
            severity: "error",
          },
        ];
      }
      return [];
    }

    if (!lookup.profitCenterCodes.has(String(targetCode))) {
      return [
        {
          errorCode: "E_INVALID_PROFIT_CENTER",
          columnName: "target_code",
          message: `target_code '${String(targetCode)}' not found among profit centers.`,
          severity: "error",
        },
      ];
    }
    return [];
  };
}

/**
 * Ordered list of pure functions per upload type (docs/07_VALIDATION_ENGINE.md
 * §5: "Validation rules are implemented as an ordered list of pure
 * functions... registered in a rule registry — new rules can be added
 * without touching the pipeline orchestration"). `E_INVALID_COA_ACCOUNT`
 * is not in §2's literal table — that table has no code at all for
 * validating `coa_account_code` against `CoaAccount` master data, which the
 * Cost template (and `cost_entries.coa_account_id`, `DATABASE_SCHEMA.md`)
 * clearly needs — added here following the exact `E_INVALID_{ENTITY}`
 * naming convention already used by its five siblings, per §5's own
 * "new rules can be added" extensibility mandate.
 */
export const ROW_RULES: Partial<Record<UploadType, RowRule[]>> = {
  cost: [
    requiredFieldsRule(["period", "cost_center_code", "coa_account_code", "nominal"]),
    periodRule(),
    numericFieldRule("nominal"),
    codeExistsRule("cost_center_code", "E_INVALID_COST_CENTER", "costCenterCodes"),
    codeExistsRule("coa_account_code", "E_INVALID_COA_ACCOUNT", "coaAccountCodes"),
    zeroValueRule("nominal"),
  ],
  revenue: [
    requiredFieldsRule(["period", "profit_center_code", "service_code", "volume", "revenue"]),
    periodRule(),
    numericFieldRule("volume"),
    numericFieldRule("revenue"),
    codeExistsRule("profit_center_code", "E_INVALID_PROFIT_CENTER", "profitCenterCodes"),
    codeExistsRule("service_code", "E_INVALID_SERVICE", "serviceProfitCenter"),
    mappingMismatchRule(),
    zeroValueRule("volume"),
  ],
  /** Sprint 5 sub-task 0. No `zeroValueRule` — a real driver value of 0 (e.g. zero devices this period) isn't flagged as `W_ZERO_VALUE`; the allocation engine's own zero-*total* handling (docs §5, Sprint 5 sub-task 3) is a distinct, cost-center-pool-level concern. */
  driver: [
    requiredFieldsRule(["period", "driver_code", "target_type", "target_code", "value"]),
    periodRule(),
    numericFieldRule("value"),
    codeExistsRule("driver_code", "E_INVALID_DRIVER", "driverCodes"),
    targetTypeRule(),
    targetCodeExistsRule(),
  ],
  /** Insert-only master-data types — no `period` rule (see `template-specs.ts`'s doc comment). */
  asset: [
    requiredFieldsRule(["code", "name", "category", "acquisition_cost", "depreciation_method", "useful_life_months"]),
    numericFieldRule("acquisition_cost"),
    numericFieldRule("useful_life_months"),
    codeExistsRule("cost_center_code", "E_INVALID_COST_CENTER", "costCenterCodes"),
    codeNotExistsRule("code", "E_DUPLICATE_ROW", "assetCodes"),
    zeroValueRule("acquisition_cost"),
  ],
  employee: [
    requiredFieldsRule(["code", "name", "employment_type"]),
    codeExistsRule("department_cost_center_code", "E_INVALID_COST_CENTER", "costCenterCodes"),
    codeNotExistsRule("code", "E_DUPLICATE_ROW", "employeeCodes"),
  ],
  bmhp: [
    requiredFieldsRule(["code", "name", "unit", "standard_cost"]),
    numericFieldRule("standard_cost"),
    codeExistsRule("vendor_code", "E_INVALID_VENDOR", "vendorCodes"),
    codeNotExistsRule("code", "E_DUPLICATE_ROW", "bmhpItemCodes"),
    zeroValueRule("standard_cost"),
  ],
  /** No natural-key/duplicate check — `tariffs` is append-only history per service; repeat rows for the same `service_code` across uploads are expected, each one superseding the prior active tariff (`ConfirmService`, matching `TariffService.create()`). */
  tariff: [
    requiredFieldsRule(["service_code", "current_tariff", "effective_date"]),
    numericFieldRule("current_tariff"),
    numericFieldRule("recommended_tariff"),
    codeExistsRule("service_code", "E_INVALID_SERVICE", "serviceProfitCenter"),
    isoDateRule("effective_date"),
    zeroValueRule("current_tariff"),
  ],
  /**
   * Sprint 8 — period-scoped like cost/revenue/driver, but one row = one
   * case/activity instance, not a period aggregate. No `NATURAL_KEY_FIELDS`
   * entry (see below) — many rows legitimately share the same
   * period+service_code+doctor_code (that's what the doctor-profitability
   * engine's SUM/AVG-by-doctor-and-service grouping requires). No
   * `OUTLIER_FIELD` either (v1 scope, same as `driver`).
   */
  medical_activity: [
    requiredFieldsRule([
      "period",
      "service_code",
      "doctor_code",
      "volume",
      "duration_minutes",
      "bmhp_cost",
      "room_cost",
      "staff_cost",
      "revenue",
    ]),
    periodRule(),
    numericFieldRule("volume"),
    numericFieldRule("duration_minutes"),
    numericFieldRule("bmhp_cost"),
    numericFieldRule("room_cost"),
    numericFieldRule("staff_cost"),
    numericFieldRule("revenue"),
    codeExistsRule("service_code", "E_INVALID_SERVICE", "serviceProfitCenter"),
    codeExistsRule("doctor_code", "E_INVALID_DOCTOR", "doctorCodes"),
    zeroValueRule("volume"),
  ],
};

/** Natural key fields per type (docs/07_VALIDATION_ENGINE.md §2: `E_DUPLICATE_ROW` — "period + cost_center + coa_account, etc."). Asset/Employee/BMHP dedupe on `code` alone (not period-scoped); Tariff has none (append-only history, see `ROW_RULES.tariff`'s doc comment). */
export const NATURAL_KEY_FIELDS: Partial<Record<UploadType, string[]>> = {
  cost: ["period", "cost_center_code", "coa_account_code"],
  revenue: ["period", "profit_center_code", "service_code"],
  driver: ["period", "driver_code", "target_type", "target_code"],
  asset: ["code"],
  employee: ["code"],
  bmhp: ["code"],
};

/**
 * `E_DUPLICATE_ROW` severity per type — defaults to `warning` (cost/revenue/
 * driver: a legitimate re-upload of the same period just needs
 * acknowledgment). Insert-only master-data types escalate to `error`: two
 * rows sharing a `code` within one file would otherwise both pass validation
 * and then collide on the live `@@unique([hospitalId, code])` constraint
 * mid-transaction at confirm time, aborting the whole batch with a raw
 * unique-violation instead of a clean validation message.
 */
export const DUPLICATE_ROW_SEVERITY: Partial<Record<UploadType, "error" | "warning">> = {
  asset: "error",
  employee: "error",
  bmhp: "error",
};

/** Field `W_OUTLIER_NOMINAL` (docs §3) tracks per type. */
export const OUTLIER_FIELD: Partial<Record<UploadType, string>> = {
  cost: "nominal",
  revenue: "revenue",
};
