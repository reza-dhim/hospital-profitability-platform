/**
 * Cost-center processing order for Step-Down allocation
 * (docs/08_COST_ALLOCATION_ENGINE.md §2, steps 1-2). "Cycle detection" here
 * is duplicate-priority detection, not general graph-cycle detection — this
 * schema has no cost-center-references-cost-center edge, only a scalar
 * `allocation_rules.priority` per cost center (confirmed design decision:
 * ordering is by `priority`, ascending = allocated earlier; a run fails
 * fast with `CYCLE_DETECTED` on any duplicate priority rather than guessing
 * a tiebreak order).
 */

export interface CostCenterPriority {
  costCenterId: string;
  priority: number;
}

export class CycleDetectedError extends Error {
  readonly code = "CYCLE_DETECTED";

  constructor(
    readonly priority: number,
    readonly costCenterIds: string[]
  ) {
    super(
      `Duplicate allocation priority ${priority} on cost centers [${costCenterIds.join(", ")}] — step-down order is ambiguous.`
    );
    this.name = "CycleDetectedError";
  }
}

/**
 * Returns cost center ids ordered ascending by priority (lowest processed
 * first, per §2 step 3). Throws `CycleDetectedError` if two or more cost
 * centers share the same priority, before any allocation math runs.
 */
export function sequenceCostCenters(entries: CostCenterPriority[]): string[] {
  const idsByPriority = new Map<number, string[]>();
  for (const entry of entries) {
    const ids = idsByPriority.get(entry.priority) ?? [];
    ids.push(entry.costCenterId);
    idsByPriority.set(entry.priority, ids);
  }

  for (const [priority, ids] of idsByPriority) {
    if (ids.length > 1) throw new CycleDetectedError(priority, ids);
  }

  return [...entries].sort((a, b) => a.priority - b.priority).map((entry) => entry.costCenterId);
}
