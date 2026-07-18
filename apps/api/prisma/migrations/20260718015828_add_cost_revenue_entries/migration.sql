-- CreateTable
CREATE TABLE "cost_entries" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "cost_center_id" TEXT NOT NULL,
    "coa_account_id" TEXT NOT NULL,
    "nominal" DECIMAL(16,2) NOT NULL,
    "source_file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_entries" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "profit_center_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "volume" DECIMAL(14,2) NOT NULL,
    "revenue" DECIMAL(16,2) NOT NULL,
    "source_file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_entries_hospital_id_period_id_idx" ON "cost_entries"("hospital_id", "period_id");

-- CreateIndex
CREATE INDEX "cost_entries_source_file_id_idx" ON "cost_entries"("source_file_id");

-- CreateIndex
CREATE INDEX "revenue_entries_hospital_id_period_id_idx" ON "revenue_entries"("hospital_id", "period_id");

-- CreateIndex
CREATE INDEX "revenue_entries_source_file_id_idx" ON "revenue_entries"("source_file_id");

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_coa_account_id_fkey" FOREIGN KEY ("coa_account_id") REFERENCES "coa_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_profit_center_id_fkey" FOREIGN KEY ("profit_center_id") REFERENCES "profit_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- Both tables carry their own `hospital_id` (unlike `upload_rows_staging`/
-- `validation_errors`), so this is the plain hospital-scoped shape used
-- everywhere else. `hpp_app` already has SELECT/INSERT/UPDATE/DELETE via
-- the original RLS migration's `ALTER DEFAULT PRIVILEGES` (no new GRANT
-- needed here). Unlike `audit_logs`, these are NOT append-only at the DB
-- grant level — `ConfirmService.rollback()` legitimately DELETEs rows here
-- (docs/01_BUSINESS_RULES.md §5), scoped by `source_file_id`.
ALTER TABLE "cost_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_entries_tenant_isolation ON cost_entries
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

ALTER TABLE "revenue_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY revenue_entries_tenant_isolation ON revenue_entries
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));
