-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "source_file_id" TEXT;

-- AlterTable
ALTER TABLE "bmhp_items" ADD COLUMN     "source_file_id" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "source_file_id" TEXT;

-- AlterTable
ALTER TABLE "tariffs" ADD COLUMN     "source_file_id" TEXT,
ADD COLUMN     "supersedes_tariff_id" TEXT;

-- CreateIndex
CREATE INDEX "assets_source_file_id_idx" ON "assets"("source_file_id");

-- CreateIndex
CREATE INDEX "bmhp_items_source_file_id_idx" ON "bmhp_items"("source_file_id");

-- CreateIndex
CREATE INDEX "employees_source_file_id_idx" ON "employees"("source_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "tariffs_supersedes_tariff_id_key" ON "tariffs"("supersedes_tariff_id");

-- CreateIndex
CREATE INDEX "tariffs_source_file_id_idx" ON "tariffs"("source_file_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bmhp_items" ADD CONSTRAINT "bmhp_items_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "upload_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_supersedes_tariff_id_fkey" FOREIGN KEY ("supersedes_tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

