-- AlterEnum
ALTER TYPE "allocation_run_status" ADD VALUE 'completed_with_errors';

-- CreateTable
CREATE TABLE "profitability_results" (
    "id" TEXT NOT NULL,
    "allocation_run_id" TEXT NOT NULL,
    "profit_center_id" TEXT NOT NULL,
    "revenue" DECIMAL(16,2) NOT NULL,
    "direct_cost" DECIMAL(16,2) NOT NULL,
    "allocated_cost" DECIMAL(16,2) NOT NULL,
    "total_cost" DECIMAL(16,2) NOT NULL,
    "gross_profit" DECIMAL(16,2) NOT NULL,
    "margin" DECIMAL(9,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profitability_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profitability_results_allocation_run_id_idx" ON "profitability_results"("allocation_run_id");

-- AddForeignKey
ALTER TABLE "profitability_results" ADD CONSTRAINT "profitability_results_allocation_run_id_fkey" FOREIGN KEY ("allocation_run_id") REFERENCES "allocation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profitability_results" ADD CONSTRAINT "profitability_results_profit_center_id_fkey" FOREIGN KEY ("profit_center_id") REFERENCES "profit_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- `profitability_results` has no hospital_id of its own (matches
-- DATABASE_SCHEMA.md's literal field list) — same EXISTS-join shape already
-- used for allocated_costs against their parent allocation_runs.
ALTER TABLE "profitability_results" ENABLE ROW LEVEL SECURITY;

CREATE POLICY profitability_results_tenant_isolation ON profitability_results
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = profitability_results.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = profitability_results.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  );
