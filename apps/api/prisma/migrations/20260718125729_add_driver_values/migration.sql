-- CreateTable
CREATE TABLE "driver_values" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "target_cost_center_id" TEXT,
    "target_profit_center_id" TEXT,
    "value" DECIMAL(14,2) NOT NULL,
    "source_file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_values_hospital_id_period_id_idx" ON "driver_values"("hospital_id", "period_id");

-- CreateIndex
CREATE INDEX "driver_values_source_file_id_idx" ON "driver_values"("source_file_id");

-- AddForeignKey
ALTER TABLE "driver_values" ADD CONSTRAINT "driver_values_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_values" ADD CONSTRAINT "driver_values_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_values" ADD CONSTRAINT "driver_values_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_values" ADD CONSTRAINT "driver_values_target_cost_center_id_fkey" FOREIGN KEY ("target_cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_values" ADD CONSTRAINT "driver_values_target_profit_center_id_fkey" FOREIGN KEY ("target_profit_center_id") REFERENCES "profit_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_values" ADD CONSTRAINT "driver_values_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one of target_cost_center_id / target_profit_center_id must be
-- set (Sprint 5 sub-task 0 design decision — see this model's schema.prisma
-- doc comment: a driver's value targets either a cost center, feeding
-- step-down cost-center-to-cost-center flow, or a profit center, feeding
-- cost-center-to-profit-center flow — never both, never neither). This is
-- the concrete DB-level payoff of choosing two nullable FKs over a single
-- generic target column: the database itself rejects an ambiguous or
-- unset row, not just application code.
ALTER TABLE "driver_values" ADD CONSTRAINT "driver_values_exactly_one_target_check"
  CHECK (
    (target_cost_center_id IS NOT NULL AND target_profit_center_id IS NULL)
    OR (target_cost_center_id IS NULL AND target_profit_center_id IS NOT NULL)
  );

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- Plain hospital-scoped shape — `driver_values` carries its own
-- `hospital_id`, same as `cost_entries`/`revenue_entries` (not the
-- `EXISTS`-join shape used for staging tables without one). `hpp_app`
-- already has SELECT/INSERT/UPDATE/DELETE via the original RLS migration's
-- `ALTER DEFAULT PRIVILEGES` (no new GRANT needed here).
ALTER TABLE "driver_values" ENABLE ROW LEVEL SECURITY;

CREATE POLICY driver_values_tenant_isolation ON driver_values
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));
