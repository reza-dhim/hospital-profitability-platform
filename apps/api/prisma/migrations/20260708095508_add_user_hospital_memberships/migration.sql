-- CreateTable
CREATE TABLE "user_hospital_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "scoped_unit_id" TEXT,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_hospital_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_hospital_memberships_user_id_hospital_id_key" ON "user_hospital_memberships"("user_id", "hospital_id");

-- AddForeignKey
ALTER TABLE "user_hospital_memberships" ADD CONSTRAINT "user_hospital_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hospital_memberships" ADD CONSTRAINT "user_hospital_memberships_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hospital_memberships" ADD CONSTRAINT "user_hospital_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hospital_memberships" ADD CONSTRAINT "user_hospital_memberships_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hospital_memberships" ADD CONSTRAINT "user_hospital_memberships_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
