# 08 — Cost Allocation Engine

Status: Draft v1 — the financial core of the platform. Formulas: `PRODUCT_BIBLE.md` §6. Methodology decision: `01_BUSINESS_RULES.md` §2. Entities: `allocation_runs`, `allocated_costs` (`DATABASE_SCHEMA.md`, `02_DOMAIN_MODEL.md`). Downstream consumer: `09_PROFITABILITY_ENGINE.md`, `10_UNIT_COST_ENGINE.md`.

## 1. Responsibility

Given a hospital + period + method (`direct` or `step_down`), compute how much of each cost center's total cost is allocated to each profit center (and, for step-down, to other cost centers first), producing `allocated_costs` rows. This is a pure, deterministic computation over `cost_entries`, `allocation_rules`, and `driver_values` — no AI, no manual override at calculation time (per `01_BUSINESS_RULES.md` §3).

## 2. Algorithm

### Direct Allocation
For each cost center `CC`, for each driver `D` assigned to `CC` via `allocation_rules`:
```
allocated_cost(CC → PC) = total_cost(CC, period) × driver_percentage(D, PC, period)
```
where `driver_percentage` is derived per `01_BUSINESS_RULES.md` §3.

### Step-Down Allocation
1. Build the cost-center dependency graph from `allocation_rules.priority` (ascending priority = allocated earlier).
2. Topologically validate: if priorities produce a cycle (e.g., misconfigured duplicate priorities), the run fails fast with a `CYCLE_DETECTED` error before any allocation math runs — surfaced to the user, not silently resolved.
3. Process cost centers in priority order. Each cost center's **total cost pool** at the time it is processed = its own direct cost (`cost_entries`) **plus** any cost already allocated into it from earlier-priority cost centers.
4. That pool is distributed to all remaining targets (lower-priority cost centers + all profit centers) per that cost center's driver percentages.
5. Once processed, a cost center is closed — no later cost center allocates back into it (enforced by iteration order, not a runtime check against future writes).

## 3. Run Lifecycle (State Machine)

```
draft → running → completed
                 ↘ failed
```
- `draft`: run created (`POST /allocation-runs`), parameters recorded, not yet executed.
- `running`: async job (BullMQ) executing; partial results are not visible to any read API.
- `completed`: all `allocated_costs` rows written in a single transaction; only now does this run become eligible to be "the latest run" for dashboards (`01_BUSINESS_RULES.md` §4).
- `failed`: any error (cycle detection, missing driver data beyond tolerance, DB error) halts the run; no partial `allocated_costs` are persisted (transactional all-or-nothing). Failure reason is stored on `allocation_runs.error_message` and surfaced to the user.

Recalculation always creates a new run (`supersedes_run_id`), never mutates a `completed` run — see `01_BUSINESS_RULES.md` §4.

## 4. Worked Example

Hospital has two cost centers (HRD priority 1, IT priority 2) and two profit centers (Rawat Jalan, Rawat Inap), Step-Down method.

| Cost Center | Direct Cost | Driver | Rawat Jalan % | Rawat Inap % | IT % |
|---|---|---|---|---|---|
| HRD | 100,000,000 | Employee Count | 40% | 40% | 20% |
| IT | 50,000,000 (direct) | Device Count | 60% | 40% | — |

Step 1 — HRD (priority 1) pool = 100,000,000. Allocates: Rawat Jalan 40,000,000; Rawat Inap 40,000,000; IT 20,000,000.
Step 2 — IT (priority 2) pool = 50,000,000 (direct) + 20,000,000 (received from HRD) = 70,000,000. Allocates: Rawat Jalan 60% × 70,000,000 = 42,000,000; Rawat Inap 40% × 70,000,000 = 28,000,000.

Result: Rawat Jalan total allocated cost = 40,000,000 + 42,000,000 = 82,000,000. Rawat Inap = 40,000,000 + 28,000,000 = 68,000,000. This example is the reference fixture for the engine's unit tests (`33_TESTING_STRATEGY.md`).

## 5. Tolerance & Edge Cases

- A cost center with **no driver_values** for any target in the period allocates zero and raises a `W_NO_DRIVER_DATA` warning on the run (visible in run detail), but does not fail the run — the cost simply remains unallocated and is surfaced as "unallocated cost" on the dashboard (never silently dropped).
- Sum-of-allocated-cost reconciliation: for every run, `SUM(allocated_costs.amount) grouped by source cost_center` must equal that cost center's total pool (direct + received) within floating-point tolerance (0.01 currency unit) — enforced as a post-run integrity assertion; a mismatch fails the run rather than publishing incorrect figures.

## 6. Performance

- Computation happens in-process (NestJS worker via BullMQ), not in raw SQL, per `ARCHITECT_AUDIT.md`'s Prisma recommendation — data is read via Prisma into memory, computed in TypeScript against the dependency graph, then bulk-written back via Prisma `createMany`. Expected data volumes and target run duration are defined in `21_NON_FUNCTIONAL_REQUIREMENTS.md` / `34_PERFORMANCE_REQUIREMENTS.md`.
