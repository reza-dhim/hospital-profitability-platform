-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "hospital_id" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_hospital_id_idx" ON "audit_logs"("hospital_id");
