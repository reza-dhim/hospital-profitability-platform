import { CycleDetectedError, sequenceCostCenters } from "./allocation-sequence";

describe("sequenceCostCenters", () => {
  it("orders cost centers ascending by priority (docs/08_COST_ALLOCATION_ENGINE.md §4 worked example: HRD priority 1 before IT priority 2)", () => {
    const order = sequenceCostCenters([
      { costCenterId: "IT", priority: 2 },
      { costCenterId: "HRD", priority: 1 },
    ]);
    expect(order).toEqual(["HRD", "IT"]);
  });

  it("handles more than two cost centers, still strictly ascending", () => {
    const order = sequenceCostCenters([
      { costCenterId: "C", priority: 3 },
      { costCenterId: "A", priority: 1 },
      { costCenterId: "B", priority: 2 },
    ]);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("returns an empty sequence for no entries", () => {
    expect(sequenceCostCenters([])).toEqual([]);
  });

  it("throws CycleDetectedError with code CYCLE_DETECTED when two cost centers share the same priority", () => {
    const run = () =>
      sequenceCostCenters([
        { costCenterId: "HRD", priority: 1 },
        { costCenterId: "IT", priority: 1 },
      ]);

    expect(run).toThrow(CycleDetectedError);
    try {
      run();
      fail("expected sequenceCostCenters to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CycleDetectedError);
      expect((error as CycleDetectedError).code).toBe("CYCLE_DETECTED");
      expect((error as CycleDetectedError).priority).toBe(1);
      expect((error as CycleDetectedError).costCenterIds).toEqual(["HRD", "IT"]);
    }
  });

  it("fails fast on duplicate priority even when a third, unambiguous cost center is also present", () => {
    expect(() =>
      sequenceCostCenters([
        { costCenterId: "HRD", priority: 1 },
        { costCenterId: "IT", priority: 1 },
        { costCenterId: "Kitchen", priority: 2 },
      ])
    ).toThrow(CycleDetectedError);
  });
});
