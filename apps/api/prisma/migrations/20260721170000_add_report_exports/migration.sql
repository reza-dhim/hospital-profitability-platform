-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('executive_summary', 'profitability_detail', 'doctor_analytics');

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "report_type" "report_type" NOT NULL,
    "generated_for_period_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "generated_by_user_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_exports_hospital_period_type_idx" ON "report_exports"("hospital_id", "generated_for_period_id", "report_type");

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_generated_for_period_id_fkey" FOREIGN KEY ("generated_for_period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- Carries its own `hospital_id`, so this is the plain hospital-scoped
-- shape used by medical_activities/cost_entries/revenue_entries (see
-- 20260721054624_add_medical_activities/migration.sql).
ALTER TABLE "report_exports" ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_exports_tenant_isolation ON report_exports
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

