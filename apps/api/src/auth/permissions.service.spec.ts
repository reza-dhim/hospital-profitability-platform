import { PermissionsService } from "./permissions.service";
import type { PrismaService } from "../prisma/prisma.service";

describe("PermissionsService", () => {
  it("returns an empty array without querying when roleId is null", async () => {
    const findMany = jest.fn();
    const prisma = { rolePermission: { findMany } } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await expect(service.getPermissionCodes(null)).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns permission codes sorted alphabetically", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { permission: { code: "rbac.write" } },
      { permission: { code: "rbac.read" } },
    ]);
    const prisma = { rolePermission: { findMany } } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await expect(service.getPermissionCodes("role-1")).resolves.toEqual(["rbac.read", "rbac.write"]);
    expect(findMany).toHaveBeenCalledWith({ where: { roleId: "role-1" }, include: { permission: true } });
  });

  it("returns an empty array without querying when hospitalId or roleName is missing", async () => {
    const findUnique = jest.fn();
    const prisma = { role: { findUnique } } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await expect(service.getPermissionCodesForRoleName(null, "system_admin")).resolves.toEqual([]);
    await expect(service.getPermissionCodesForRoleName("hospital-1", null)).resolves.toEqual([]);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("resolves permission codes for a hospital-scoped role name", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      rolePermissions: [{ permission: { code: "rbac.read" } }, { permission: { code: "rbac.write" } }],
    });
    const prisma = { role: { findUnique } } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await expect(service.getPermissionCodesForRoleName("hospital-1", "system_admin")).resolves.toEqual([
      "rbac.read",
      "rbac.write",
    ]);
    expect(findUnique).toHaveBeenCalledWith({
      where: { hospitalId_name: { hospitalId: "hospital-1", name: "system_admin" } },
      include: { rolePermissions: { include: { permission: true } } },
    });
  });

  it("returns an empty array when the role does not exist", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = { role: { findUnique } } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await expect(service.getPermissionCodesForRoleName("hospital-1", "ghost_role")).resolves.toEqual([]);
  });

  it("hashes identical permission sets identically", () => {
    const service = new PermissionsService({} as PrismaService);
    expect(service.hashPermissions(["a", "b"])).toBe(service.hashPermissions(["a", "b"]));
  });

  it("hashes different permission sets differently", () => {
    const service = new PermissionsService({} as PrismaService);
    expect(service.hashPermissions(["a", "b"])).not.toBe(service.hashPermissions(["a", "c"]));
  });
});
