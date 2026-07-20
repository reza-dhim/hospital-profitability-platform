-- CreateEnum
CREATE TYPE "cost_center_type" AS ENUM ('direct', 'indirect');

-- CreateEnum
CREATE TYPE "target_margin_scope_type" AS ENUM ('hospital', 'profit_center', 'service');

-- AlterTable
-- Existing free-text values ('support', from all Sprint 3 seed data) don't
-- match either new enum label directly, unlike allocation_rules.method's
-- equivalent migration — every existing cost center is indirect (none was
-- ever marked as directly owned by one profit center), so the cast maps
-- the literal 'direct' string through and defaults everything else to
-- 'indirect'.
ALTER TABLE "cost_centers" ADD COLUMN     "profit_center_id" TEXT;
ALTER TABLE "cost_centers" ALTER COLUMN "type" TYPE "cost_center_type" USING (
  CASE WHEN "type" = 'direct' THEN 'direct'::"cost_center_type" ELSE 'indirect'::"cost_center_type" END
);

-- CreateTable
CREATE TABLE "target_margins" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "scope_type" "target_margin_scope_type" NOT NULL,
    "scope_id" TEXT,
    "target_margin" DECIMAL(5,2) NOT NULL,
    "effective_period_id" TEXT NOT NULL,
    "set_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_margins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_margins_hospital_id_scope_type_scope_id_idx" ON "target_margins"("hospital_id", "scope_type", "scope_id");

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_profit_center_id_fkey" FOREIGN KEY ("profit_center_id") REFERENCES "profit_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_margins" ADD CONSTRAINT "target_margins_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_margins" ADD CONSTRAINT "target_margins_effective_period_id_fkey" FOREIGN KEY ("effective_period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_margins" ADD CONSTRAINT "target_margins_set_by_user_id_fkey" FOREIGN KEY ("set_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `profit_center_id` must be set exactly when type = 'direct' (Sprint 6
-- sub-task 0 design decision — see this column's schema.prisma doc
-- comment): a direct cost center is inherently owned by one profit center;
-- an indirect one flows only through the allocation graph and must not
-- point at a profit center directly.
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_direct_requires_profit_center_check"
  CHECK (
    (type = 'direct' AND profit_center_id IS NOT NULL)
    OR (type = 'indirect' AND profit_center_id IS NULL)
  );

-- `scope_id` must be null exactly when scope_type = 'hospital' (same
-- polymorphic-shape convention as driver_values/allocated_costs).
ALTER TABLE "target_margins" ADD CONSTRAINT "target_margins_scope_id_matches_scope_type_check"
  CHECK (
    (scope_type = 'hospital' AND scope_id IS NULL)
    OR (scope_type IN ('profit_center', 'service') AND scope_id IS NOT NULL)
  );

-- Row-Level Security (docs/03_MULTI_TENANT.md §2, docs/14_SECURITY.md §5).
-- `target_margins` carries its own hospital_id — plain hospital-scoped
-- policy, same shape as allocation_runs/driver_values/cost_entries.
ALTER TABLE "target_margins" ENABLE ROW LEVEL SECURITY;

CREATE POLICY target_margins_tenant_isolation ON target_margins
  FOR ALL
  USING (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''))
  WITH CHECK (hospital_id = NULLIF(current_setting('app.current_hospital_id', true), ''));
