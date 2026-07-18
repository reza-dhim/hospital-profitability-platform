-- AlterTable
ALTER TABLE "hospital_settings" ADD COLUMN     "outlier_stddev_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 3;
