import { Decimal, toDecimal, type Numeric } from "./money";
import { allocatedCost, driverPercentage } from "./formulas";
import { sequenceCostCenters } from "./allocation-sequence";

/**
 * Direct and Step-Down allocation (docs/08_COST_ALLOCATION_ENGINE.md §2,
 * docs/01_BUSINESS_RULES.md §2-3). Pure, framework-free — reads nothing,
 * writes nothing; the caller (apps/api, Sprint 5 sub-task 4) is responsible
 * for loading `cost_entries`/`allocation_rules`/`driver_values` and
 * persisting the returned `AllocatedCostEntry[]` as `allocated_costs` rows.
 */

export type TargetRef =
  | { type: "cost_center"; costCenterId: string }
  | { type: "profit_center"; profitCenterId: string };

export interface DriverValueInput {
  driverId: string;
  target: TargetRef;
  value: Numeric;
}

export interface DirectCostCenterInput {
  costCenterId: string;
  directCost: Numeric;
  driverId: string;
}

export interface StepDownCostCenterInput extends DirectCostCenterInput {
  /** `allocation_rules.priority` — ascending, processed earlier first. */
  priority: number;
}

export interface AllocatedCostEntry {
  sourceCostCenterId: string;
  target: TargetRef;
  driverId: string;
  amount: Decimal;
}

/**
 * Confirmed Sprint 5 design decision — deliberate deviation from
 * docs/08_COST_ALLOCATION_ENGINE.md §5's literal "no driver_values ->
 * allocates zero, stays unallocated" behavior: when a cost center's driver
 * has zero total value across its candidate targets (no driver_values rows,
 * or all zero), the pool is split *equally* across those targets instead of
 * staying unallocated, and a `W_DRIVER_ZERO` warning is raised so the gap
 * is visible rather than silently absorbed into "unallocated cost."
 */
export interface AllocationWarning {
  code: "W_DRIVER_ZERO";
  costCenterId: string;
  driverId: string;
}

function targetKey(target: TargetRef): string {
  return target.type === "cost_center" ? `cc:${target.costCenterId}` : `pc:${target.profitCenterId}`;
}

/**
 * Splits `pool` across `targets` per that driver's percentages. `targets` is
 * the full candidate set (independent of which of them actually have
 * driver_values rows) so a zero driver-value for a listed target is
 * distinguishable from that target not being a candidate at all. Falls back
 * to an equal split across `targets` (with a `W_DRIVER_ZERO` signal) when
 * the driver's total value across all candidates is zero.
 */
function distributePool(
  pool: Numeric,
  targets: TargetRef[],
  driverValues: DriverValueInput[]
): { entries: { target: TargetRef; amount: Decimal }[]; driverZero: boolean } {
  if (targets.length === 0) return { entries: [], driverZero: false };

  const poolDecimal = toDecimal(pool);
  const valueByTarget = new Map(driverValues.map((dv) => [targetKey(dv.target), toDecimal(dv.value)]));
  const total = targets.reduce((sum, t) => sum.plus(valueByTarget.get(targetKey(t)) ?? new Decimal(0)), new Decimal(0));

  if (total.isZero()) {
    const share = poolDecimal.dividedBy(targets.length);
    return { entries: targets.map((target) => ({ target, amount: share })), driverZero: true };
  }

  return {
    entries: targets.map((target) => {
      const targetValue = valueByTarget.get(targetKey(target)) ?? new Decimal(0);
      const percentage = driverPercentage(targetValue, total)!; // total already proven non-zero above
      return { target, amount: allocatedCost(poolDecimal, percentage) };
    }),
    driverZero: false,
  };
}

/**
 * Direct Allocation (docs/01_BUSINESS_RULES.md §2): each cost center's
 * direct cost is distributed straight to profit centers via its own
 * driver — no cost-center-to-cost-center flow.
 */
export function allocateDirect(
  costCenters: DirectCostCenterInput[],
  profitCenterIds: string[],
  driverValues: DriverValueInput[]
): { entries: AllocatedCostEntry[]; warnings: AllocationWarning[] } {
  const targets: TargetRef[] = profitCenterIds.map((profitCenterId) => ({ type: "profit_center", profitCenterId }));
  const entries: AllocatedCostEntry[] = [];
  const warnings: AllocationWarning[] = [];

  for (const cc of costCenters) {
    const relevantDriverValues = driverValues.filter((dv) => dv.driverId === cc.driverId);
    const { entries: dist, driverZero } = distributePool(cc.directCost, targets, relevantDriverValues);
    if (driverZero) warnings.push({ code: "W_DRIVER_ZERO", costCenterId: cc.costCenterId, driverId: cc.driverId });
    for (const d of dist) {
      entries.push({ sourceCostCenterId: cc.costCenterId, target: d.target, driverId: cc.driverId, amount: d.amount });
    }
  }

  return { entries, warnings };
}

/**
 * Step-Down Allocation (docs/08_COST_ALLOCATION_ENGINE.md §2 steps 3-5):
 * cost centers are processed in ascending-priority order (via
 * `sequenceCostCenters` — throws `CycleDetectedError` on duplicate
 * priorities before any allocation math runs). Each cost center's pool =
 * its own direct cost + whatever it already received from earlier-priority
 * cost centers; that pool is spread across all later-priority cost centers
 * and all profit centers. Once processed, a cost center is closed — the
 * iteration order itself (never revisiting an earlier index) is what
 * prevents any later cost center from allocating back into it.
 */
export function allocateStepDown(
  costCenters: StepDownCostCenterInput[],
  profitCenterIds: string[],
  driverValues: DriverValueInput[]
): { entries: AllocatedCostEntry[]; warnings: AllocationWarning[] } {
  const order = sequenceCostCenters(costCenters.map((cc) => ({ costCenterId: cc.costCenterId, priority: cc.priority })));
  const byId = new Map(costCenters.map((cc) => [cc.costCenterId, cc]));
  const pools = new Map<string, Decimal>(costCenters.map((cc) => [cc.costCenterId, toDecimal(cc.directCost)]));

  const entries: AllocatedCostEntry[] = [];
  const warnings: AllocationWarning[] = [];

  for (let i = 0; i < order.length; i++) {
    const costCenterId = order[i]!;
    const cc = byId.get(costCenterId)!;
    const pool = pools.get(costCenterId)!;

    const targets: TargetRef[] = [
      ...order.slice(i + 1).map((id): TargetRef => ({ type: "cost_center", costCenterId: id })),
      ...profitCenterIds.map((profitCenterId): TargetRef => ({ type: "profit_center", profitCenterId })),
    ];
    const relevantDriverValues = driverValues.filter((dv) => dv.driverId === cc.driverId);
    const { entries: dist, driverZero } = distributePool(pool, targets, relevantDriverValues);
    if (driverZero) warnings.push({ code: "W_DRIVER_ZERO", costCenterId, driverId: cc.driverId });

    for (const d of dist) {
      entries.push({ sourceCostCenterId: costCenterId, target: d.target, driverId: cc.driverId, amount: d.amount });
      if (d.target.type === "cost_center") {
        pools.set(d.target.costCenterId, (pools.get(d.target.costCenterId) ?? new Decimal(0)).plus(d.amount));
      }
    }
  }

  return { entries, warnings };
}

export interface ReconciliationMismatch {
  costCenterId: string;
  expectedPool: Decimal;
  actualAllocated: Decimal;
}

const RECONCILIATION_TOLERANCE = new Decimal("0.01");

/**
 * Post-run integrity assertion (docs/08_COST_ALLOCATION_ENGINE.md §5): for
 * every source cost center, `SUM(allocated_costs.amount)` must equal that
 * cost center's total pool (its own direct cost + whatever it received from
 * earlier cost centers, recomputed here from `entries` rather than trusted
 * from internal state) within 0.01 tolerance. Holds by construction for any
 * cost center with at least one candidate target (percentages, or the
 * `W_DRIVER_ZERO` equal split, always sum to exactly 1) — this exists as a
 * defense-in-depth check the caller uses to fail a run rather than publish
 * figures that don't reconcile, and to catch the one legitimate gap: a cost
 * center with zero candidate targets has nowhere to send its pool.
 */
export function reconcileAllocation(
  costCenters: DirectCostCenterInput[],
  entries: AllocatedCostEntry[]
): ReconciliationMismatch[] {
  const directCostById = new Map(costCenters.map((cc) => [cc.costCenterId, toDecimal(cc.directCost)]));
  const receivedById = new Map<string, Decimal>();
  const allocatedById = new Map<string, Decimal>();

  for (const entry of entries) {
    allocatedById.set(entry.sourceCostCenterId, (allocatedById.get(entry.sourceCostCenterId) ?? new Decimal(0)).plus(entry.amount));
    if (entry.target.type === "cost_center") {
      receivedById.set(
        entry.target.costCenterId,
        (receivedById.get(entry.target.costCenterId) ?? new Decimal(0)).plus(entry.amount)
      );
    }
  }

  const mismatches: ReconciliationMismatch[] = [];
  for (const cc of costCenters) {
    const expectedPool = (directCostById.get(cc.costCenterId) ?? new Decimal(0)).plus(
      receivedById.get(cc.costCenterId) ?? new Decimal(0)
    );
    const actualAllocated = allocatedById.get(cc.costCenterId) ?? new Decimal(0);
    if (expectedPool.minus(actualAllocated).abs().gt(RECONCILIATION_TOLERANCE)) {
      mismatches.push({ costCenterId: cc.costCenterId, expectedPool, actualAllocated });
    }
  }
  return mismatches;
}
