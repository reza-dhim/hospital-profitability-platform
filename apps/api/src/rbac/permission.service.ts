import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { PermissionResponseDto } from "./dto/permission-response.dto";

function moduleOf(code: string): string {
  return code.split(".")[0] ?? code;
}

/**
 * Read-only: the permission catalog is code/seed-defined (docs/04_RBAC.md §3
 * — "enumerated list lives in code"), not user-creatable, so there is no
 * create/update/delete here by design.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(module?: string): Promise<PermissionResponseDto[]> {
    const permissions = await this.prisma.permission.findMany({ orderBy: { code: "asc" } });
    return permissions
      .map((permission) => ({ id: permission.id, code: permission.code, name: permission.name, module: moduleOf(permission.code) }))
      .filter((permission) => !module || permission.module === module);
  }
}
