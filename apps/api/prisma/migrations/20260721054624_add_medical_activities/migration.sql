-- CreateTable
CREATE TABLE "medical_activities" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "volume" DECIMAL(14,2) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "bmhp_cost" DECIMAL(16,2) NOT NULL,
    "room_cost" DECIMAL(16,2) NOT NULL,
    "staff_cost" DECIMAL(16,2) NOT NULL,
    "revenue" DECIMAL(16,2) NOT NULL,
    "source_file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medical_activities_hospital_id_period_id_idx" ON "medical_activities"("hospital_id", "period_id");

-- CreateIndex
CREATE INDEX "medical_activities_source_file_id_idx" ON "medical_activities"("source_file_id");

-- CreateIndex
CREATE INDEX "medical_activities_service_id_period_id_idx" ON "medical_activities"("service_id", "period_id");

-- AddForeignKey
ALTER TABLE "medical_activities" ADD CONSTRAINT "medical_activities_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_activities" ADD CONSTRAINT "medical_activities_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_activities" ADD CONSTRAINT "medical_activities_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_activities" ADD CONSTRAINT "medical_activities_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_activities" ADD CONSTRAINT "medical_activities_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- Carries its own `hospital_id`, so this is the plain hospital-scoped
-- shape used by cost_entries/revenue_entries/driver_values (see
-- 20260718015828_add_cost_revenue_entries/migration.sql). Not append-only
-- at the DB grant level — ConfirmService.rollback() legitimately DELETEs
-- rows here, scoped by source_file_id, same as its siblings.
ALTER TABLE "medical_activities" ENABLE ROW LEVEL SECURITY;

CREATE POLICY medical_activities_tenant_isolation ON medical_activities
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));

