import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

/**
 * docs/33_TESTING_STRATEGY.md §3: a small but complete fixture hospital
 * ("Rumah Sakit Contoh") for local dev, tests, and demo use.
 */
const DEFAULT_ROLES: Array<{ name: string; description: string; isDefault: boolean }> = [
  { name: "direktur", description: "Direktur Rumah Sakit", isDefault: true },
  { name: "cfo_finance_director", description: "CFO / Finance Director", isDefault: true },
  { name: "tim_costing", description: "Tim Costing", isDefault: true },
  { name: "kepala_unit", description: "Kepala Unit", isDefault: true },
  { name: "manajemen_medis", description: "Manajemen Medis", isDefault: true },
  { name: "system_admin", description: "Admin Sistem", isDefault: true },
];

/**
 * Minimal starter permission catalog scoped to auth/RBAC administration
 * itself (docs/04_RBAC.md §2 "RBAC / User Management" row, System Admin:
 * Read/Write) — deliberately not business-module permissions (cost centers,
 * uploads, etc.), which are seeded by the sprint that builds each module.
 */
const STARTER_PERMISSIONS: Array<{ code: string; name: string }> = [
  { code: "rbac.read", name: "View users, roles, and permissions" },
  { code: "rbac.write", name: "Manage users, roles, and permissions" },
];

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

  const roleIdByName = new Map<string, string>();
  for (const role of DEFAULT_ROLES) {
    const created = await prisma.role.upsert({
      where: { hospitalId_name: { hospitalId: hospital.id, name: role.name } },
      update: {},
      create: {
        hospitalId: hospital.id,
        name: role.name,
        description: role.description,
        isDefault: role.isDefault,
      },
    });
    roleIdByName.set(role.name, created.id);
  }

  const permissionIdByCode = new Map<string, string>();
  for (const permission of STARTER_PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });
    permissionIdByCode.set(permission.code, created.id);
  }

  const systemAdminRoleId = roleIdByName.get("system_admin");
  if (!systemAdminRoleId) {
    throw new Error("system_admin role was not seeded — cannot assign starter permissions.");
  }
  for (const permission of STARTER_PERMISSIONS) {
    const permissionId = permissionIdByCode.get(permission.code);
    if (!permissionId) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: systemAdminRoleId, permissionId } },
      update: {},
      create: { roleId: systemAdminRoleId, permissionId },
    });
  }

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@contoh.local";
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!Dev";
  const passwordHash = await argon2.hash(superAdminPassword, { type: argon2.argon2id });

  await prisma.user.upsert({
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

  // eslint-disable-next-line no-console
  console.log(
    `Seeded organization "${organization.name}" with hospital "${hospital.name}", ` +
      `${DEFAULT_ROLES.length} default roles, ${STARTER_PERMISSIONS.length} starter permissions, ` +
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
