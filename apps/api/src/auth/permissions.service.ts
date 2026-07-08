import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Resolves a role's permission codes (docs/04_RBAC.md §3) and computes the
 * `permissions_hash` token claim. `PermissionsGuard` calls `getPermissionCodes`
 * live on every permission-gated request rather than trusting a cached hash —
 * see the guard for why.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Used where the caller already has the role id (e.g. AuthService, which loads the full User row). */
  async getPermissionCodes(roleId: string | null): Promise<string[]> {
    if (!roleId) return [];
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rolePermissions.map((rp) => rp.permission.code).sort();
  }

  /**
   * Used by PermissionsGuard, which only has the JWT payload's `role` (name)
   * and `active_hospital_id` claims — not the role id — since docs/05_AUTHENTICATION.md
   * §1 doesn't specify a `role_id` claim. Roles are hospital-scoped
   * (`@@unique([hospitalId, name])`), so both are required to resolve one.
   */
  async getPermissionCodesForRoleName(hospitalId: string | null, roleName: string | null): Promise<string[]> {
    if (!hospitalId || !roleName) return [];
    const role = await this.prisma.role.findUnique({
      where: { hospitalId_name: { hospitalId, name: roleName } },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) return [];
    return role.rolePermissions.map((rp) => rp.permission.code).sort();
  }

  hashPermissions(codes: string[]): string {
    return createHash("sha256").update(JSON.stringify(codes)).digest("hex");
  }
}
