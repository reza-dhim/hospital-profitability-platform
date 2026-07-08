import type { PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG } from "./permission-catalog";
import { DEFAULT_ROLE_NAMES, DEFAULT_ROLE_PERMISSIONS } from "./default-role-permissions";

const DEFAULT_ROLE_DESCRIPTIONS: Record<string, string> = {
  direktur: "Direktur Rumah Sakit",
  cfo_finance_director: "CFO / Finance Director",
  tim_costing: "Tim Costing",
  kepala_unit: "Kepala Unit",
  manajemen_medis: "Manajemen Medis",
  system_admin: "Admin Sistem",
};

/**
 * Seeds the platform-wide permission catalog (idempotent — shared across all
 * hospitals, docs/04_RBAC.md §3) and, for a single given hospital, the six
 * default roles with their permission grants (docs/04_RBAC.md §2). Framework-
 * free (plain `PrismaClient`, not a Nest injectable) so it can run both from
 * `prisma/seed.ts` (a standalone script) and from `HospitalService.create()`
 * (docs/03_MULTI_TENANT.md §5 — new-hospital onboarding seeds default roles).
 *
 * Safe to call repeatedly: every write is an upsert.
 */
export async function seedPermissionCatalog(prisma: PrismaClient): Promise<Map<string, string>> {
  const permissionIdByCode = new Map<string, string>();
  for (const permission of PERMISSION_CATALOG) {
    const created = await prisma.permission.upsert({
      where: { code: permission.code },
      update: { name: permission.name },
      create: { code: permission.code, name: permission.name },
    });
    permissionIdByCode.set(permission.code, created.id);
  }
  return permissionIdByCode;
}

export async function seedDefaultRolesForHospital(
  prisma: PrismaClient,
  hospitalId: string,
  permissionIdByCode?: Map<string, string>
): Promise<Map<string, string>> {
  const permissionIds = permissionIdByCode ?? (await seedPermissionCatalog(prisma));

  const roleIdByName = new Map<string, string>();
  for (const roleName of DEFAULT_ROLE_NAMES) {
    const role = await prisma.role.upsert({
      where: { hospitalId_name: { hospitalId, name: roleName } },
      update: {},
      create: {
        hospitalId,
        name: roleName,
        description: DEFAULT_ROLE_DESCRIPTIONS[roleName],
        isDefault: true,
      },
    });
    roleIdByName.set(roleName, role.id);

    const grantedCodes = DEFAULT_ROLE_PERMISSIONS[roleName];
    for (const code of grantedCodes) {
      const permissionId = permissionIds.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  return roleIdByName;
}
