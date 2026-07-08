import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import type { PermissionsService } from "../permissions.service";

function makeContext(
  user: { role: string | null; active_hospital_id: string | null } | undefined
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  it("allows the request when no @RequirePermissions metadata is present", async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const permissionsService = {
      getPermissionCodesForRoleName: jest.fn(),
    } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissionsService);

    await expect(
      guard.canActivate(makeContext({ role: "system_admin", active_hospital_id: "h1" }))
    ).resolves.toBe(true);
    expect(permissionsService.getPermissionCodesForRoleName).not.toHaveBeenCalled();
  });

  it("denies the request when there is no authenticated user", async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["rbac.write"]) } as unknown as Reflector;
    const permissionsService = {
      getPermissionCodesForRoleName: jest.fn(),
    } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissionsService);

    await expect(guard.canActivate(makeContext(undefined))).resolves.toBe(false);
  });

  it("allows the request when the user's role grants all required permissions", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["rbac.read", "rbac.write"]),
    } as unknown as Reflector;
    const permissionsService = {
      getPermissionCodesForRoleName: jest.fn().mockResolvedValue(["rbac.read", "rbac.write"]),
    } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissionsService);

    await expect(
      guard.canActivate(makeContext({ role: "system_admin", active_hospital_id: "h1" }))
    ).resolves.toBe(true);
  });

  it("denies the request when the user's role is missing a required permission", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["rbac.read", "rbac.write"]),
    } as unknown as Reflector;
    const permissionsService = {
      getPermissionCodesForRoleName: jest.fn().mockResolvedValue(["rbac.read"]),
    } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissionsService);

    await expect(
      guard.canActivate(makeContext({ role: "tim_costing", active_hospital_id: "h1" }))
    ).resolves.toBe(false);
  });
});
