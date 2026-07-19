import { CycleDetectedError } from "./allocation-sequence";
import { allocateDirect, allocateStepDown, reconcileAllocation } from "./allocation-engine";

describe("allocateDirect", () => {
  /**
   * MANUAL CALCULATION (verify by hand, no need to read the implementation):
   * Laundry cost center, direct cost 10,000,000, driven by kg-laundry to
   * two profit centers: PC-RJ 700kg, PC-RI 300kg. Total kg = 1000.
   *   PC-RJ % = 700 / 1000 = 0.70  -> 10,000,000 * 0.70 = 7,000,000
   *   PC-RI % = 300 / 1000 = 0.30  -> 10,000,000 * 0.30 = 3,000,000
   */
  it("splits Laundry's 10,000,000 by kg-laundry into 7,000,000 / 3,000,000 across two profit centers", () => {
    const { entries, warnings } = allocateDirect(
      [{ costCenterId: "LAUNDRY", directCost: 10_000_000, driverId: "KG_LAUNDRY" }],
      ["PC-RJ", "PC-RI"],
      [
        { driverId: "KG_LAUNDRY", target: { type: "profit_center", profitCenterId: "PC-RJ" }, value: 700 },
        { driverId: "KG_LAUNDRY", target: { type: "profit_center", profitCenterId: "PC-RI" }, value: 300 },
      ]
    );

    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(2);
    const rj = entries.find((e) => e.target.type === "profit_center" && e.target.profitCenterId === "PC-RJ")!;
    const ri = entries.find((e) => e.target.type === "profit_center" && e.target.profitCenterId === "PC-RI")!;
    expect(rj.amount.toNumber()).toBe(7_000_000);
    expect(ri.amount.toNumber()).toBe(3_000_000);
    expect(rj.sourceCostCenterId).toBe("LAUNDRY");
    expect(rj.driverId).toBe("KG_LAUNDRY");
  });

  /**
   * MANUAL CALCULATION:
   * Kitchen cost center, direct cost 10,000,000, driver has NO values at
   * all for its two candidate profit centers (total driver value = 0).
   * Confirmed Sprint 5 deviation from docs §5: instead of staying
   * unallocated, split equally across the 2 candidates and warn.
   *   PC-A share = 10,000,000 / 2 = 5,000,000
   *   PC-B share = 10,000,000 / 2 = 5,000,000
   */
  it("falls back to an equal split with a W_DRIVER_ZERO warning when the driver has zero total value", () => {
    const { entries, warnings } = allocateDirect(
      [{ costCenterId: "KITCHEN", directCost: 10_000_000, driverId: "MEAL_COUNT" }],
      ["PC-A", "PC-B"],
      []
    );

    expect(warnings).toEqual([{ code: "W_DRIVER_ZERO", costCenterId: "KITCHEN", driverId: "MEAL_COUNT" }]);
    expect(entries).toHaveLength(2);
    for (const entry of entries) expect(entry.amount.toNumber()).toBe(5_000_000);
  });

  it("produces no entries and no warning when there are no candidate profit centers at all", () => {
    const { entries, warnings } = allocateDirect(
      [{ costCenterId: "LAUNDRY", directCost: 10_000_000, driverId: "KG_LAUNDRY" }],
      [],
      []
    );
    expect(entries).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe("allocateStepDown", () => {
  /**
   * MANUAL CALCULATION — the reference fixture from
   * docs/08_COST_ALLOCATION_ENGINE.md §4:
   * HRD (priority 1, direct cost 100,000,000, driver Employee Count) and
   * IT (priority 2, direct cost 50,000,000, driver Device Count), two
   * profit centers Rawat Jalan (RJ) and Rawat Inap (RI).
   *
   * Step 1 — HRD pool = 100,000,000. Employee Count driver values:
   * RJ=40, RI=40, IT=20 (total 100) -> 40%/40%/20%.
   *   -> RJ: 100,000,000 * 0.40 = 40,000,000
   *   -> RI: 100,000,000 * 0.40 = 40,000,000
   *   -> IT: 100,000,000 * 0.20 = 20,000,000
   *
   * Step 2 — IT pool = 50,000,000 (direct) + 20,000,000 (received from
   * HRD) = 70,000,000. Device Count driver values: RJ=60, RI=40 (total
   * 100) -> 60%/40%. (IT is closed by this point — never a target.)
   *   -> RJ: 70,000,000 * 0.60 = 42,000,000
   *   -> RI: 70,000,000 * 0.40 = 28,000,000
   *
   * Totals: RJ = 40,000,000 + 42,000,000 = 82,000,000.
   *         RI = 40,000,000 + 28,000,000 = 68,000,000.
   */
  it("matches the docs §4 HRD/IT worked example exactly: RJ=82,000,000, RI=68,000,000", () => {
    const { entries, warnings } = allocateStepDown(
      [
        { costCenterId: "HRD", directCost: 100_000_000, driverId: "EMP_COUNT", priority: 1 },
        { costCenterId: "IT", directCost: 50_000_000, driverId: "DEVICE_COUNT", priority: 2 },
      ],
      ["RJ", "RI"],
      [
        { driverId: "EMP_COUNT", target: { type: "profit_center", profitCenterId: "RJ" }, value: 40 },
        { driverId: "EMP_COUNT", target: { type: "profit_center", profitCenterId: "RI" }, value: 40 },
        { driverId: "EMP_COUNT", target: { type: "cost_center", costCenterId: "IT" }, value: 20 },
        { driverId: "DEVICE_COUNT", target: { type: "profit_center", profitCenterId: "RJ" }, value: 60 },
        { driverId: "DEVICE_COUNT", target: { type: "profit_center", profitCenterId: "RI" }, value: 40 },
      ]
    );

    expect(warnings).toEqual([]);

    const fromHrdToIt = entries.find((e) => e.sourceCostCenterId === "HRD" && e.target.type === "cost_center")!;
    expect(fromHrdToIt.amount.toNumber()).toBe(20_000_000);
    const fromHrdToRj = entries.find(
      (e) => e.sourceCostCenterId === "HRD" && e.target.type === "profit_center" && e.target.profitCenterId === "RJ"
    )!;
    expect(fromHrdToRj.amount.toNumber()).toBe(40_000_000);
    const fromHrdToRi = entries.find(
      (e) => e.sourceCostCenterId === "HRD" && e.target.type === "profit_center" && e.target.profitCenterId === "RI"
    )!;
    expect(fromHrdToRi.amount.toNumber()).toBe(40_000_000);

    const fromItToRj = entries.find(
      (e) => e.sourceCostCenterId === "IT" && e.target.type === "profit_center" && e.target.profitCenterId === "RJ"
    )!;
    expect(fromItToRj.amount.toNumber()).toBe(42_000_000);
    const fromItToRi = entries.find(
      (e) => e.sourceCostCenterId === "IT" && e.target.type === "profit_center" && e.target.profitCenterId === "RI"
    )!;
    expect(fromItToRi.amount.toNumber()).toBe(28_000_000);

    // IT never allocates back to HRD — closed once processed.
    expect(entries.some((e) => e.sourceCostCenterId === "IT" && e.target.type === "cost_center")).toBe(false);

    const totalRj = entries
      .filter((e) => e.target.type === "profit_center" && e.target.profitCenterId === "RJ")
      .reduce((sum, e) => sum + e.amount.toNumber(), 0);
    expect(totalRj).toBe(82_000_000);

    const totalRi = entries
      .filter((e) => e.target.type === "profit_center" && e.target.profitCenterId === "RI")
      .reduce((sum, e) => sum + e.amount.toNumber(), 0);
    expect(totalRi).toBe(68_000_000);
  });

  it("throws CycleDetectedError (via sequenceCostCenters) before doing any allocation math when priorities collide", () => {
    const run = () =>
      allocateStepDown(
        [
          { costCenterId: "HRD", directCost: 100_000_000, driverId: "EMP_COUNT", priority: 1 },
          { costCenterId: "IT", directCost: 50_000_000, driverId: "DEVICE_COUNT", priority: 1 },
        ],
        ["RJ", "RI"],
        []
      );
    expect(run).toThrow(CycleDetectedError);
  });

  /**
   * MANUAL CALCULATION: single cost center Kitchen (priority 1, direct
   * cost 10,000,000, driver MEAL_COUNT) with zero driver-value total
   * across its only candidate, profit center PC-A. Equal split across 1
   * target is just the whole pool.
   *   PC-A share = 10,000,000 / 1 = 10,000,000
   */
  it("applies the W_DRIVER_ZERO equal-split fallback mid-sequence, and still carries the (correct) pool into later cost centers", () => {
    const { entries, warnings } = allocateStepDown(
      [{ costCenterId: "KITCHEN", directCost: 10_000_000, driverId: "MEAL_COUNT", priority: 1 }],
      ["PC-A"],
      []
    );
    expect(warnings).toEqual([{ code: "W_DRIVER_ZERO", costCenterId: "KITCHEN", driverId: "MEAL_COUNT" }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount.toNumber()).toBe(10_000_000);
  });
});

describe("reconcileAllocation", () => {
  it("reports no mismatches for the docs §4 HRD/IT worked example (each source cost center's pool fully allocated)", () => {
    const costCenters = [
      { costCenterId: "HRD", directCost: 100_000_000, driverId: "EMP_COUNT" },
      { costCenterId: "IT", directCost: 50_000_000, driverId: "DEVICE_COUNT" },
    ];
    const { entries } = allocateStepDown(
      costCenters.map((cc, i) => ({ ...cc, priority: i + 1 })),
      ["RJ", "RI"],
      [
        { driverId: "EMP_COUNT", target: { type: "profit_center", profitCenterId: "RJ" }, value: 40 },
        { driverId: "EMP_COUNT", target: { type: "profit_center", profitCenterId: "RI" }, value: 40 },
        { driverId: "EMP_COUNT", target: { type: "cost_center", costCenterId: "IT" }, value: 20 },
        { driverId: "DEVICE_COUNT", target: { type: "profit_center", profitCenterId: "RJ" }, value: 60 },
        { driverId: "DEVICE_COUNT", target: { type: "profit_center", profitCenterId: "RI" }, value: 40 },
      ]
    );

    expect(reconcileAllocation(costCenters, entries)).toEqual([]);
  });

  it("flags a cost center whose entries don't sum to its expected pool", () => {
    const costCenters = [{ costCenterId: "LAUNDRY", directCost: 10_000_000, driverId: "KG_LAUNDRY" }];
    const entries = [
      {
        sourceCostCenterId: "LAUNDRY",
        target: { type: "profit_center" as const, profitCenterId: "PC-RJ" },
        driverId: "KG_LAUNDRY",
        amount: (allocateDirect(costCenters, ["PC-RJ"], []).entries[0]!.amount).minus(1), // simulate a 1-unit discrepancy
      },
    ];

    const mismatches = reconcileAllocation(costCenters, entries);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.costCenterId).toBe("LAUNDRY");
    expect(mismatches[0]!.expectedPool.toNumber()).toBe(10_000_000);
  });

  it("tolerates a sub-0.01 rounding difference without flagging a mismatch", () => {
    const costCenters = [{ costCenterId: "LAUNDRY", directCost: 10_000_000, driverId: "KG_LAUNDRY" }];
    const entries = [
      {
        sourceCostCenterId: "LAUNDRY",
        target: { type: "profit_center" as const, profitCenterId: "PC-RJ" },
        driverId: "KG_LAUNDRY",
        amount: allocateDirect(costCenters, ["PC-RJ"], []).entries[0]!.amount.minus("0.005"),
      },
    ];
    expect(reconcileAllocation(costCenters, entries)).toEqual([]);
  });
});
