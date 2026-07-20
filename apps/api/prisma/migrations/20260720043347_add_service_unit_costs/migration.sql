-- CreateTable
CREATE TABLE "service_unit_costs" (
    "id" TEXT NOT NULL,
    "allocation_run_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "service_allocated_cost" DECIMAL(16,2) NOT NULL,
    "service_direct_cost" DECIMAL(16,2) NOT NULL,
    "service_volume" DECIMAL(14,2) NOT NULL,
    "unit_cost" DECIMAL(16,4),
    "current_tariff" DECIMAL(14,2),
    "tariff_gap" DECIMAL(14,4),
    "target_margin_used" DECIMAL(9,4) NOT NULL,
    "recommended_tariff" DECIMAL(16,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_unit_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_unit_costs_allocation_run_id_idx" ON "service_unit_costs"("allocation_run_id");

-- AddForeignKey
ALTER TABLE "service_unit_costs" ADD CONSTRAINT "service_unit_costs_allocation_run_id_fkey" FOREIGN KEY ("allocation_run_id") REFERENCES "allocation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_unit_costs" ADD CONSTRAINT "service_unit_costs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- `service_unit_costs` has no hospital_id of its own — same EXISTS-join
-- shape as its sibling `profitability_results` against their shared parent
-- allocation_runs.
ALTER TABLE "service_unit_costs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_unit_costs_tenant_isolation ON service_unit_costs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = service_unit_costs.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM allocation_runs
      WHERE allocation_runs.id = service_unit_costs.allocation_run_id
        AND allocation_runs.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  );
