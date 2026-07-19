-- CreateEnum
CREATE TYPE "allocation_run_status" AS ENUM ('draft', 'running', 'completed', 'failed');

-- AlterTable
-- Prisma's auto-generated drop+recreate would fail (NOT NULL column with
-- existing rows, no default). Existing text values ('direct'/'step_down')
-- already match the allocation_method enum labels, so a direct cast is safe.
ALTER TABLE "allocation_rules" ALTER COLUMN "method" TYPE "allocation_method" USING ("method"::"allocation_method");

-- CreateTable
CREATE TABLE "allocation_runs" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "method" "allocation_method" NOT NULL,
    "status" "allocation_run_status" NOT NULL DEFAULT 'draft',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error_message" TEXT,
    "supersedes_run_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocated_costs" (
    "id" TEXT NOT NULL,
    "allocation_run_id" TEXT NOT NULL,
    "source_cost_center_id" TEXT NOT NULL,
    "target_cost_center_id" TEXT,
    "target_profit_center_id" TEXT,
    "driver_id" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocated_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "allocation_runs_supersedes_run_id_key" ON "allocation_runs"("supersedes_run_id");

-- CreateIndex
CREATE INDEX "allocation_runs_hospital_id_period_id_idx" ON "allocation_runs"("hospital_id", "period_id");

-- CreateIndex
CREATE INDEX "allocated_costs_allocation_run_id_idx" ON "allocated_costs"("allocation_run_id");

-- AddForeignKey
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_supersedes_run_id_fkey" FOREIGN KEY ("supersedes_run_id") REFERENCES "allocation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocated_costs" ADD CONSTRAINT "allocated_costs_allocation_run_id_fkey" FOREIGN KEY ("allocation_run_id") REFERENCES "allocation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocated_costs" ADD CONSTRAINT "allocated_costs_source_cost_center_id_fkey" FOREIGN KEY ("source_cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocated_costs" ADD CONSTRAINT "allocated_costs_target_cost_center_id_fkey" FOREIGN KEY ("target_cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocated_costs" ADD CONSTRAINT "allocated_costs_target_profit_center_id_fkey" FOREIGN KEY ("target_profit_center_id") REFERENCES "profit_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocated_costs" ADD CONSTRAINT "allocated_costs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one of target_cost_center_id / target_profit_center_id must be
-- set, mirroring driver_values_exactly_one_target_check (see the
-- 20260718125729_add_driver_values migration and this model's schema.prisma
-- doc comment): a cost center's allocated cost flows either to another cost
-- center (step-down intermediate leg) or to a profit center (final leg) —
-- never both, never neither.
ALTER TABLE "allocated_costs" ADD CONSTRAINT "allocated_costs_exactly_one_target_check"
  CHECK (
    (target_cost_center_id IS NOT NULL AND target_profit_center_id IS NULL)
    OR (target_cost_center_id IS NULL AND target_profit_center_id IS NOT NULL)
  );

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- `allocation_runs` carries its own hospital_id — plain hospital-scoped
-- policy, same shape as driver_values/cost_entries/revenue_entries.
ALTER TABLE "allocation_runs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY allocation_runs_tenant_isolation ON allocation_runs
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

-- `allocated_costs` has no hospital_id of its own (Calculation group, per
-- docs/DATABASE_SCHEMA.md's literal field list) — same EXISTS-join shape
-- already used for upload_rows_staging/validation_errors against their
-- parent upload_batches, here joined against the parent allocation_runs.
ALTER TABLE "allocated_costs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY allocated_costs_tenant_isolation ON allocated_costs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = allocated_costs.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = allocated_costs.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  );
