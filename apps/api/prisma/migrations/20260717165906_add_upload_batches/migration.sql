-- CreateEnum
CREATE TYPE "upload_type" AS ENUM ('cost', 'revenue', 'driver', 'asset', 'employee', 'medical_activity', 'bmhp', 'tariff');

-- CreateEnum
CREATE TYPE "upload_batch_status" AS ENUM ('staged', 'validating', 'validated', 'confirmed', 'rolled_back', 'failed');

-- AlterTable
ALTER TABLE "hospital_settings" ADD COLUMN     "max_upload_file_size_mb" INTEGER NOT NULL DEFAULT 25;

-- CreateTable
CREATE TABLE "upload_batches" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "type" "upload_type" NOT NULL,
    "period_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "status" "upload_batch_status" NOT NULL DEFAULT 'staged',
    "row_count" INTEGER,
    "error_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),

    CONSTRAINT "upload_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_batches_hospital_id_status_idx" ON "upload_batches"("hospital_id", "status");

-- CreateIndex
CREATE INDEX "upload_batches_period_id_idx" ON "upload_batches"("period_id");

-- AddForeignKey
ALTER TABLE "upload_batches" ADD CONSTRAINT "upload_batches_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_batches" ADD CONSTRAINT "upload_batches_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_batches" ADD CONSTRAINT "upload_batches_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- `upload_batches` is a plain hospital-scoped table, same shape as
-- `periods`/`cost_centers`/etc — added here rather than amending the
-- original RLS migration since this table didn't exist yet when it ran.
-- `hpp_app` already has SELECT/INSERT/UPDATE/DELETE via that migration's
-- `ALTER DEFAULT PRIVILEGES` (no new GRANT needed here).
ALTER TABLE "upload_batches" ENABLE ROW LEVEL SECURITY;

CREATE POLICY upload_batches_tenant_isolation ON upload_batches
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));
