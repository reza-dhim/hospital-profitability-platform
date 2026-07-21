import { MasterDataLookup, ROW_RULES } from "./row-validation-rules";
import type { ValidationIssue } from "./validation-issue";

const lookup: MasterDataLookup = {
  costCenterCodes: new Set(["CC-1"]),
  coaAccountCodes: new Set(["COA-1"]),
  profitCenterCodes: new Set(["PC-1"]),
  driverCodes: new Set(["DRV-1"]),
  serviceProfitCenter: new Map([["SVC-1", "PC-1"]]),
  vendorCodes: new Set(["VND-1"]),
  assetCodes: new Set(["AST-EXISTING"]),
  employeeCodes: new Set(["EMP-EXISTING"]),
  bmhpItemCodes: new Set(["BMHP-EXISTING"]),
  doctorCodes: new Set(["DOC-1"]),
};

function runCostRules(raw: Record<string, string | number | null>, periodLabel = "2026-01"): ValidationIssue[] {
  return ROW_RULES.cost!.flatMap((rule) => rule(raw, periodLabel, lookup));
}

function runRevenueRules(raw: Record<string, string | number | null>, periodLabel = "2026-01"): ValidationIssue[] {
  return ROW_RULES.revenue!.flatMap((rule) => rule(raw, periodLabel, lookup));
}

function runDriverRules(raw: Record<string, string | number | null>, periodLabel = "2026-01"): ValidationIssue[] {
  return ROW_RULES.driver!.flatMap((rule) => rule(raw, periodLabel, lookup));
}

const validCostRow = { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 };
const validRevenueRow = { period: "2026-01", profit_center_code: "PC-1", service_code: "SVC-1", volume: 10, revenue: 5000 };
const validDriverRowToCostCenter = {
  period: "2026-01",
  driver_code: "DRV-1",
  target_type: "cost_center",
  target_code: "CC-1",
  value: 700,
};
const validDriverRowToProfitCenter = {
  period: "2026-01",
  driver_code: "DRV-1",
  target_type: "profit_center",
  target_code: "PC-1",
  value: 300,
};

describe("cost row rules", () => {
  it("passes a fully valid row with no issues", () => {
    expect(runCostRules(validCostRow)).toEqual([]);
  });

  it("flags every empty required field with E_MISSING_VALUE", () => {
    const issues = runCostRules({ period: "", cost_center_code: null, coa_account_code: "COA-1", nominal: 1000 });
    const codes = issues.map((i) => `${i.errorCode}:${i.columnName}`);
    expect(codes).toEqual(
      expect.arrayContaining(["E_MISSING_VALUE:period", "E_MISSING_VALUE:cost_center_code"])
    );
  });

  it("flags a malformed period label with E_INVALID_TYPE", () => {
    const issues = runCostRules({ ...validCostRow, period: "January 2026" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_TYPE", columnName: "period" }));
  });

  it("flags a period that doesn't match the upload's own target period with E_INVALID_PERIOD", () => {
    const issues = runCostRules({ ...validCostRow, period: "2026-02" }, "2026-01");
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_PERIOD", columnName: "period" }));
  });

  it("flags a non-numeric nominal with E_INVALID_TYPE", () => {
    const issues = runCostRules({ ...validCostRow, nominal: "not-a-number" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_TYPE", columnName: "nominal" }));
  });

  it("accepts a comma-formatted numeric string for nominal", () => {
    expect(runCostRules({ ...validCostRow, nominal: "1,000,000" })).toEqual([]);
  });

  it("flags a zero nominal with W_ZERO_VALUE (warning, not error)", () => {
    const issues = runCostRules({ ...validCostRow, nominal: 0 });
    expect(issues).toEqual([{ errorCode: "W_ZERO_VALUE", columnName: "nominal", message: expect.any(String), severity: "warning" }]);
  });

  it("flags an unknown cost_center_code with E_INVALID_COST_CENTER", () => {
    const issues = runCostRules({ ...validCostRow, cost_center_code: "CC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_COST_CENTER" }));
  });

  it("flags an unknown coa_account_code with E_INVALID_COA_ACCOUNT", () => {
    const issues = runCostRules({ ...validCostRow, coa_account_code: "COA-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_COA_ACCOUNT" }));
  });
});

describe("revenue row rules", () => {
  it("passes a fully valid row with no issues", () => {
    expect(runRevenueRules(validRevenueRow)).toEqual([]);
  });

  it("flags an unknown profit_center_code with E_INVALID_PROFIT_CENTER", () => {
    const issues = runRevenueRules({ ...validRevenueRow, profit_center_code: "PC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_PROFIT_CENTER" }));
  });

  it("flags an unknown service_code with E_INVALID_SERVICE", () => {
    const issues = runRevenueRules({ ...validRevenueRow, service_code: "SVC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_SERVICE" }));
  });

  it("flags E_MAPPING_MISMATCH when the service's configured profit center doesn't match the row's profit_center_code", () => {
    expect(runRevenueRules(validRevenueRow)).toEqual([]); // baseline: matching PC-1 raises nothing

    const lookupWithOtherPc: MasterDataLookup = { ...lookup, serviceProfitCenter: new Map([["SVC-1", "PC-2"]]) };
    const mismatchIssues = ROW_RULES.revenue!.flatMap((rule) => rule(validRevenueRow, "2026-01", lookupWithOtherPc));
    expect(mismatchIssues).toContainEqual(
      expect.objectContaining({ errorCode: "E_MAPPING_MISMATCH", columnName: "profit_center_code" })
    );
  });

  it("does not also raise E_MAPPING_MISMATCH for an already-unknown service (avoids double-flagging)", () => {
    const issues = runRevenueRules({ ...validRevenueRow, service_code: "SVC-999" });
    expect(issues.filter((i) => i.errorCode === "E_MAPPING_MISMATCH")).toEqual([]);
  });

  it("flags a zero volume with W_ZERO_VALUE", () => {
    const issues = runRevenueRules({ ...validRevenueRow, volume: 0 });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "W_ZERO_VALUE", columnName: "volume" }));
  });
});

describe("driver row rules", () => {
  it("passes a fully valid row targeting a cost center with no issues", () => {
    expect(runDriverRules(validDriverRowToCostCenter)).toEqual([]);
  });

  it("passes a fully valid row targeting a profit center with no issues", () => {
    expect(runDriverRules(validDriverRowToProfitCenter)).toEqual([]);
  });

  it("flags every empty required field with E_MISSING_VALUE", () => {
    const issues = runDriverRules({ period: "2026-01", driver_code: null, target_type: "", target_code: "CC-1", value: 100 });
    const codes = issues.map((i) => `${i.errorCode}:${i.columnName}`);
    expect(codes).toEqual(expect.arrayContaining(["E_MISSING_VALUE:driver_code", "E_MISSING_VALUE:target_type"]));
  });

  it("flags an unrecognized target_type with E_INVALID_TYPE", () => {
    const issues = runDriverRules({ ...validDriverRowToCostCenter, target_type: "branch" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_TYPE", columnName: "target_type" }));
  });

  it("flags an unknown driver_code with E_INVALID_DRIVER", () => {
    const issues = runDriverRules({ ...validDriverRowToCostCenter, driver_code: "DRV-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_DRIVER" }));
  });

  it("flags an unknown target_code with E_INVALID_COST_CENTER when target_type is cost_center", () => {
    const issues = runDriverRules({ ...validDriverRowToCostCenter, target_code: "CC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_COST_CENTER", columnName: "target_code" }));
  });

  it("flags an unknown target_code with E_INVALID_PROFIT_CENTER when target_type is profit_center", () => {
    const issues = runDriverRules({ ...validDriverRowToProfitCenter, target_code: "PC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_PROFIT_CENTER", columnName: "target_code" }));
  });

  it("does not double-flag target_code when target_type is already invalid", () => {
    const issues = runDriverRules({ ...validDriverRowToCostCenter, target_type: "branch", target_code: "whatever" });
    expect(issues.filter((i) => i.columnName === "target_code")).toEqual([]);
  });

  it("flags a non-numeric value with E_INVALID_TYPE", () => {
    const issues = runDriverRules({ ...validDriverRowToCostCenter, value: "lots" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_TYPE", columnName: "value" }));
  });

  it("does NOT flag a driver value of exactly zero — a real zero is a legitimate answer, not treated like W_ZERO_VALUE for cost/revenue", () => {
    const issues = runDriverRules({ ...validDriverRowToCostCenter, value: 0 });
    expect(issues).toEqual([]);
  });
});

function runAssetRules(raw: Record<string, string | number | null>): ValidationIssue[] {
  return ROW_RULES.asset!.flatMap((rule) => rule(raw, "2026-01", lookup));
}

function runEmployeeRules(raw: Record<string, string | number | null>): ValidationIssue[] {
  return ROW_RULES.employee!.flatMap((rule) => rule(raw, "2026-01", lookup));
}

function runBmhpRules(raw: Record<string, string | number | null>): ValidationIssue[] {
  return ROW_RULES.bmhp!.flatMap((rule) => rule(raw, "2026-01", lookup));
}

function runTariffRules(raw: Record<string, string | number | null>): ValidationIssue[] {
  return ROW_RULES.tariff!.flatMap((rule) => rule(raw, "2026-01", lookup));
}

const validAssetRow = {
  code: "AST-NEW",
  name: "USG Machine",
  category: "medical-equipment",
  cost_center_code: "CC-1",
  acquisition_cost: 250000000,
  depreciation_method: "straight-line",
  useful_life_months: 60,
};

const validEmployeeRow = {
  code: "EMP-NEW",
  name: "Siti Rahma",
  role_title: "Staff Administrasi",
  department_cost_center_code: "CC-1",
  employment_type: "permanent",
};

const validBmhpRow = {
  code: "BMHP-NEW",
  name: "Sarung Tangan Steril",
  unit: "box",
  standard_cost: 45000,
  vendor_code: "VND-1",
};

const validTariffRow = {
  service_code: "SVC-1",
  current_tariff: 150000,
  recommended_tariff: 175000,
  effective_date: "2026-08-01",
};

describe("asset row rules (insert-only master data)", () => {
  it("passes a fully valid row with no issues", () => {
    expect(runAssetRules(validAssetRow)).toEqual([]);
  });

  it("flags a code that already exists live with E_DUPLICATE_ROW (error, not warning)", () => {
    const issues = runAssetRules({ ...validAssetRow, code: "AST-EXISTING" });
    expect(issues).toContainEqual(
      expect.objectContaining({ errorCode: "E_DUPLICATE_ROW", columnName: "code", severity: "error" })
    );
  });

  it("flags an unknown cost_center_code with E_INVALID_COST_CENTER", () => {
    const issues = runAssetRules({ ...validAssetRow, cost_center_code: "CC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_COST_CENTER" }));
  });

  it("does not require cost_center_code — optional FK", () => {
    const issues = runAssetRules({ ...validAssetRow, cost_center_code: null });
    expect(issues).toEqual([]);
  });

  it("flags a non-numeric acquisition_cost with E_INVALID_TYPE", () => {
    const issues = runAssetRules({ ...validAssetRow, acquisition_cost: "lots" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_TYPE", columnName: "acquisition_cost" }));
  });
});

describe("employee row rules (insert-only master data)", () => {
  it("passes a fully valid row with no issues", () => {
    expect(runEmployeeRules(validEmployeeRow)).toEqual([]);
  });

  it("flags a code that already exists live with E_DUPLICATE_ROW (error)", () => {
    const issues = runEmployeeRules({ ...validEmployeeRow, code: "EMP-EXISTING" });
    expect(issues).toContainEqual(
      expect.objectContaining({ errorCode: "E_DUPLICATE_ROW", columnName: "code", severity: "error" })
    );
  });

  it("does not require role_title or department_cost_center_code — optional fields", () => {
    const issues = runEmployeeRules({ ...validEmployeeRow, role_title: null, department_cost_center_code: null });
    expect(issues).toEqual([]);
  });
});

describe("bmhp row rules (insert-only master data)", () => {
  it("passes a fully valid row with no issues", () => {
    expect(runBmhpRules(validBmhpRow)).toEqual([]);
  });

  it("flags a code that already exists live with E_DUPLICATE_ROW (error)", () => {
    const issues = runBmhpRules({ ...validBmhpRow, code: "BMHP-EXISTING" });
    expect(issues).toContainEqual(
      expect.objectContaining({ errorCode: "E_DUPLICATE_ROW", columnName: "code", severity: "error" })
    );
  });

  it("flags an unknown vendor_code with E_INVALID_VENDOR", () => {
    const issues = runBmhpRules({ ...validBmhpRow, vendor_code: "VND-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_VENDOR" }));
  });

  it("flags a zero standard_cost with W_ZERO_VALUE (warning)", () => {
    const issues = runBmhpRules({ ...validBmhpRow, standard_cost: 0 });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "W_ZERO_VALUE", severity: "warning" }));
  });
});

describe("tariff row rules (append-only history — no duplicate check)", () => {
  it("passes a fully valid row with no issues", () => {
    expect(runTariffRules(validTariffRow)).toEqual([]);
  });

  it("does not require recommended_tariff — optional", () => {
    expect(runTariffRules({ ...validTariffRow, recommended_tariff: null })).toEqual([]);
  });

  it("flags an unknown service_code with E_INVALID_SERVICE", () => {
    const issues = runTariffRules({ ...validTariffRow, service_code: "SVC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_SERVICE" }));
  });

  it("flags a malformed effective_date with E_INVALID_TYPE", () => {
    const issues = runTariffRules({ ...validTariffRow, effective_date: "08/01/2026" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_TYPE", columnName: "effective_date" }));
  });

  it("allows repeat rows for the same service_code — no E_DUPLICATE_ROW at the row-rule level", () => {
    expect(runTariffRules(validTariffRow)).toEqual([]);
    expect(runTariffRules(validTariffRow)).toEqual([]); // running the same "row" twice, still clean — no cross-row state at this layer
  });
});

function runMedicalActivityRules(raw: Record<string, string | number | null>): ValidationIssue[] {
  return ROW_RULES.medical_activity!.flatMap((rule) => rule(raw, "2026-01", lookup));
}

const validMedicalActivityRow = {
  period: "2026-01",
  service_code: "SVC-1",
  doctor_code: "DOC-1",
  volume: 3,
  duration_minutes: 45,
  bmhp_cost: 250000,
  room_cost: 500000,
  staff_cost: 150000,
  revenue: 1500000,
};

describe("medical_activity row rules (period-scoped, case-level — no duplicate check)", () => {
  it("passes a fully valid row with no issues", () => {
    expect(runMedicalActivityRules(validMedicalActivityRow)).toEqual([]);
  });

  it("flags every empty required field with E_MISSING_VALUE", () => {
    const issues = runMedicalActivityRules({ ...validMedicalActivityRow, service_code: null, doctor_code: "" });
    const codes = issues.map((i) => `${i.errorCode}:${i.columnName}`);
    expect(codes).toEqual(expect.arrayContaining(["E_MISSING_VALUE:service_code", "E_MISSING_VALUE:doctor_code"]));
  });

  it("flags a period that doesn't match the upload's own target period with E_INVALID_PERIOD", () => {
    const issues = runMedicalActivityRules({ ...validMedicalActivityRow, period: "2026-02" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_PERIOD" }));
  });

  it("flags an unknown service_code with E_INVALID_SERVICE", () => {
    const issues = runMedicalActivityRules({ ...validMedicalActivityRow, service_code: "SVC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_SERVICE" }));
  });

  it("flags an unknown doctor_code with E_INVALID_DOCTOR", () => {
    const issues = runMedicalActivityRules({ ...validMedicalActivityRow, doctor_code: "DOC-999" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_DOCTOR" }));
  });

  it("flags a non-numeric bmhp_cost with E_INVALID_TYPE", () => {
    const issues = runMedicalActivityRules({ ...validMedicalActivityRow, bmhp_cost: "lots" });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "E_INVALID_TYPE", columnName: "bmhp_cost" }));
  });

  it("flags a zero volume with W_ZERO_VALUE (warning)", () => {
    const issues = runMedicalActivityRules({ ...validMedicalActivityRow, volume: 0 });
    expect(issues).toContainEqual(expect.objectContaining({ errorCode: "W_ZERO_VALUE", columnName: "volume", severity: "warning" }));
  });

  it("allows repeated rows for the same period+service_code+doctor_code — one row = one case, not a duplicate", () => {
    expect(runMedicalActivityRules(validMedicalActivityRow)).toEqual([]);
    expect(runMedicalActivityRules(validMedicalActivityRow)).toEqual([]); // same "row" twice — no cross-row state at this layer
  });
});
