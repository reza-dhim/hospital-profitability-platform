-- CreateTable
CREATE TABLE "doctor_profitability_results" (
    "id" TEXT NOT NULL,
    "allocation_run_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "revenue" DECIMAL(16,2) NOT NULL,
    "cost" DECIMAL(16,2) NOT NULL,
    "profit" DECIMAL(16,2) NOT NULL,
    "margin" DECIMAL(9,4),
    "avg_duration" DECIMAL(9,2) NOT NULL,
    "avg_bmhp" DECIMAL(16,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_profitability_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_profitability_results_allocation_run_id_service_id_idx" ON "doctor_profitability_results"("allocation_run_id", "service_id");

-- AddForeignKey
ALTER TABLE "doctor_profitability_results" ADD CONSTRAINT "doctor_profitability_results_allocation_run_id_fkey" FOREIGN KEY ("allocation_run_id") REFERENCES "allocation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profitability_results" ADD CONSTRAINT "doctor_profitability_results_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profitability_results" ADD CONSTRAINT "doctor_profitability_results_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- `doctor_profitability_results` has no hospital_id of its own — same
-- EXISTS-join shape as sibling `service_unit_costs`/`profitability_results`
-- against their shared parent allocation_runs.
ALTER TABLE "doctor_profitability_results" ENABLE ROW LEVEL SECURITY;

CREATE POLICY doctor_profitability_results_tenant_isolation ON doctor_profitability_results
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = doctor_profitability_results.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = doctor_profitability_results.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  );

