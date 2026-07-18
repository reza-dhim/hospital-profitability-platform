-- CreateEnum
CREATE TYPE "upload_row_status" AS ENUM ('valid', 'invalid', 'promoted');

-- CreateEnum
CREATE TYPE "validation_severity" AS ENUM ('error', 'warning');

-- CreateTable
CREATE TABLE "upload_rows_staging" (
    "id" TEXT NOT NULL,
    "upload_batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_json" JSONB NOT NULL,
    "status" "upload_row_status" NOT NULL DEFAULT 'valid',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_rows_staging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_errors" (
    "id" TEXT NOT NULL,
    "upload_batch_id" TEXT NOT NULL,
    "row_number" INTEGER,
    "column_name" TEXT,
    "error_code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "validation_severity" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_rows_staging_upload_batch_id_idx" ON "upload_rows_staging"("upload_batch_id");

-- CreateIndex
CREATE INDEX "validation_errors_upload_batch_id_idx" ON "validation_errors"("upload_batch_id");

-- AddForeignKey
ALTER TABLE "upload_rows_staging" ADD CONSTRAINT "upload_rows_staging_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_errors" ADD CONSTRAINT "validation_errors_upload_batch_id_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "upload_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- Neither table has its own `hospital_id` column (matches
-- docs/02_DOMAIN_MODEL.md's field list exactly) — scoped instead via an
-- `EXISTS` join to `upload_batches.hospital_id`, the same pattern
-- `role_permissions`/`refresh_tokens` already use in
-- 20260713120000_add_row_level_security for child tables without their own
-- tenant column. `hpp_app` already has SELECT/INSERT/UPDATE/DELETE via that
-- migration's `ALTER DEFAULT PRIVILEGES` (no new GRANT needed here).
ALTER TABLE "upload_rows_staging" ENABLE ROW LEVEL SECURITY;

CREATE POLICY upload_rows_staging_tenant_isolation ON upload_rows_staging
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM upload_batches
      WHERE upload_batches.id = upload_rows_staging.upload_batch_id
        AND upload_batches.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM upload_batches
      WHERE upload_batches.id = upload_rows_staging.upload_batch_id
        AND upload_batches.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  );

ALTER TABLE "validation_errors" ENABLE ROW LEVEL SECURITY;

CREATE POLICY validation_errors_tenant_isolation ON validation_errors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM upload_batches
      WHERE upload_batches.id = validation_errors.upload_batch_id
        AND upload_batches.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM upload_batches
      WHERE upload_batches.id = validation_errors.upload_batch_id
        AND upload_batches.hospital_id = NULLIF(current_setting('app.current_hospital_id', true), '')
    )
  );
