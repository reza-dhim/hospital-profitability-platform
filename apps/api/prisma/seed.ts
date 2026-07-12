import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { seedDefaultRolesForHospital } from "../src/rbac/rbac-seed";
import { seedDemoMasterData } from "../src/master-data/master-data-seed";

const prisma = new PrismaClient();

/**
 * docs/33_TESTING_STRATEGY.md §3: a small but complete fixture hospital
 * ("Rumah Sakit Contoh") for local dev, tests, and demo use.
 *
 * Sprint 2.2: role/permission seeding now delegates to
 * `seedDefaultRolesForHospital` (src/rbac/rbac-seed.ts) — the full
 * docs/04_RBAC.md §2 catalog, the same code path `HospitalService.create()`
 * uses for onboarding a new hospital — instead of the Sprint 2.1 minimal
 * `rbac.*`-only starter set, so local/demo data reflects real default-role grants.
 */
async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Contoh Group",
    },
  });

  const hospital = await prisma.hospital.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "RSC" } },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Rumah Sakit Contoh",
      code: "RSC",
      address: "Jl. Contoh No. 1, Jakarta",
    },
  });

  const roleIdByName = await seedDefaultRolesForHospital(prisma, hospital.id);

  const systemAdminRoleId = roleIdByName.get("system_admin");
  if (!systemAdminRoleId) {
    throw new Error("system_admin role was not seeded — cannot create Super Admin user.");
  }

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@contoh.local";
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!Dev";
  const passwordHash = await argon2.hash(superAdminPassword, { type: argon2.argon2id });

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      organizationId: organization.id,
      hospitalId: hospital.id,
      roleId: systemAdminRoleId,
      name: "Super Admin",
      email: superAdminEmail,
      passwordHash,
      status: "active",
    },
  });

  // Sprint 3: master-data demo fixture (13 entities + hospital_settings),
  // Indonesian hospital terminology, for local dev/demo/smoke-test use.
  await seedDemoMasterData(prisma, hospital.id, superAdmin.id);

  // eslint-disable-next-line no-console
  console.log(
    `Seeded organization "${organization.name}" with hospital "${hospital.name}", ` +
      `${roleIdByName.size} default roles with docs/04_RBAC.md §2 permission grants, ` +
      `and Super Admin login "${superAdminEmail}" (change SEED_SUPER_ADMIN_PASSWORD outside local dev).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
