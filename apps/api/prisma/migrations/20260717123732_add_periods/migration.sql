-- CreateEnum
CREATE TYPE "period_status" AS ENUM ('draft', 'open', 'locked', 'closed');

-- CreateTable
CREATE TABLE "periods" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "period_status" NOT NULL DEFAULT 'draft',
    "locked_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "reopened_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "periods_hospital_id_status_idx" ON "periods"("hospital_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "periods_hospital_id_label_key" ON "periods"("hospital_id", "label");

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- `periods` is a plain hospital-scoped table like `cost_centers`/`tariffs`/etc
-- in 20260713120000_add_row_level_security — same policy shape, added here
-- instead of amending that migration because `periods` didn't exist yet when
-- it ran. `hpp_app` already has SELECT/INSERT/UPDATE/DELETE on this table via
-- that migration's `ALTER DEFAULT PRIVILEGES` (no new GRANT needed here).
ALTER TABLE "periods" ENABLE ROW LEVEL SECURITY;

CREATE POLICY periods_tenant_isolation ON periods
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));
