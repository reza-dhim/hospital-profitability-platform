import { MasterDataLookup, ROW_RULES } from "./row-validation-rules";
import type { ValidationIssue } from "./validation-issue";

const lookup: MasterDataLookup = {
  costCenterCodes: new Set(["CC-1"]),
  coaAccountCodes: new Set(["COA-1"]),
  profitCenterCodes: new Set(["PC-1"]),
  serviceProfitCenter: new Map([["SVC-1", "PC-1"]]),
};

function runCostRules(raw: Record<string, string | number | null>, periodLabel = "2026-01"): ValidationIssue[] {
  return ROW_RULES.cost!.flatMap((rule) => rule(raw, periodLabel, lookup));
}

function runRevenueRules(raw: Record<string, string | number | null>, periodLabel = "2026-01"): ValidationIssue[] {
  return ROW_RULES.revenue!.flatMap((rule) => rule(raw, periodLabel, lookup));
}

const validCostRow = { period: "2026-01", cost_center_code: "CC-1", coa_account_code: "COA-1", nominal: 1000 };
const validRevenueRow = { period: "2026-01", profit_center_code: "PC-1", service_code: "SVC-1", volume: 10, revenue: 5000 };

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
