-- AlterTable
ALTER TABLE "allocation_runs" ADD COLUMN     "is_stale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stale_at" TIMESTAMP(3);
