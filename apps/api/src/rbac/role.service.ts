import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { tenantSessionSql } from "../prisma/tenant-session.sql";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { PaginationQueryDto, paginationMeta } from "../common/dto/pagination.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import type { RoleResponseDto } from "./dto/role-response.dto";

type RoleWithPermissions = {
  id: string;
  hospitalId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  rolePermissions: { permission: { code: string } }[];
};

function toResponse(role: RoleWithPermissions): RoleResponseDto {
  return {
    id: role.id,
    hospitalId: role.hospitalId,
    name: role.name,
    description: role.description,
    isDefault: role.isDefault,
    permissionCodes: role.rolePermissions.map((rp) => rp.permission.code).sort(),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/** Roles are hospital-scoped (docs/04_RBAC.md §1) — every method is passed the caller's resolved hospitalId, never a client-supplied one. */
@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService
  ) {}

  async create(hospitalId: string, dto: CreateRoleDto, actorUserId: string): Promise<RoleResponseDto> {
    const existing = await this.prisma.role.findUnique({
      where: { hospitalId_name: { hospitalId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException({ code: "ROLE_NAME_TAKEN", message: `Role "${dto.name}" already exists.` });
    }

    const permissionCodes = dto.permissionCodes ?? [];
    const permissions = permissionCodes.length
      ? await this.prisma.permission.findMany({ where: { code: { in: permissionCodes } } })
      : [];

    const role = await this.prisma.role.create({
      data: {
        hospitalId,
        name: dto.name,
        description: dto.description,
        isDefault: false,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        rolePermissions: {
          create: permissions.map((permission) => ({ permissionId: permission.id })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });

    return toResponse(role);
  }

  async findAll(
    hospitalId: string,
    query: PaginationQueryDto
  ): Promise<{ data: RoleResponseDto[]; meta: ReturnType<typeof paginationMeta> }> {
    const where = {
      hospitalId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    };

    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        include: { rolePermissions: { include: { permission: true } } },
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.role.count({ where }),
    ]);

    return { data: roles.map(toResponse), meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(hospitalId: string, id: string): Promise<RoleResponseDto> {
    const role = await this.prisma.role.findFirst({
      where: { id, hospitalId, deletedAt: null },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Role not found." });
    }
    return toResponse(role);
  }

  async update(hospitalId: string, id: string, dto: UpdateRoleDto, actorUserId: string): Promise<RoleResponseDto> {
    const role = await this.requireMutableRole(hospitalId, id);

    if (dto.name && dto.name !== role.name) {
      const conflict = await this.prisma.role.findUnique({
        where: { hospitalId_name: { hospitalId, name: dto.name } },
      });
      if (conflict) {
        throw new ConflictException({ code: "ROLE_NAME_TAKEN", message: `Role "${dto.name}" already exists.` });
      }
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description, updatedByUserId: actorUserId },
      include: { rolePermissions: { include: { permission: true } } },
    });

    return toResponse(updated);
  }

  async remove(hospitalId: string, id: string, actorUserId: string): Promise<void> {
    await this.requireMutableRole(hospitalId, id);
    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date(), updatedByUserId: actorUserId },
    });
  }

  async assignPermissions(
    hospitalId: string,
    id: string,
    permissionCodes: string[],
    actorUserId: string
  ): Promise<RoleResponseDto> {
    // Default roles' permission set CAN be adjusted by System Admin (docs/04_RBAC.md §1) —
    // unlike name/delete, this is not blocked by isDefault.
    const role = await this.prisma.role.findFirst({ where: { id, hospitalId, deletedAt: null } });
    if (!role) {
      throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Role not found." });
    }

    const permissions = await this.prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    const foundCodes = new Set(permissions.map((p) => p.code));
    const unknownCodes = permissionCodes.filter((code) => !foundCodes.has(code));
    if (unknownCodes.length > 0) {
      throw new NotFoundException({
        code: "PERMISSION_CODE_UNKNOWN",
        message: `Unknown permission code(s): ${unknownCodes.join(", ")}.`,
      });
    }

    // The RLS session GUCs (docs/03_MULTI_TENANT.md §2) are normally set
    // automatically by the tenant-rls Prisma extension, but an array-form
    // `$transaction` batches operations that are already constructed
    // (dispatched) against the top-level client before this call runs them —
    // by the time they're batched, it's too late for the extension to wrap
    // each one in its own session-setting transaction without breaking the
    // batch's atomicity. This transaction sets them itself, as the first
    // statement, and `setManagedTransaction(true)` tells the extension to
    // skip its usual per-operation wrapping for the other elements of this
    // same array. See `tenant-rls.extension.ts`'s doc comment for why.
    this.tenantContextService.setManagedTransaction(true);
    try {
      await this.prisma.$transaction([
        this.prisma.$executeRaw(tenantSessionSql(this.tenantContextService)),
        this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        this.prisma.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: id, permissionId: permission.id })),
        }),
        this.prisma.role.update({ where: { id }, data: { updatedByUserId: actorUserId } }),
      ]);
    } finally {
      this.tenantContextService.setManagedTransaction(false);
    }

    return this.findOne(hospitalId, id);
  }

  private async requireMutableRole(hospitalId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, hospitalId, deletedAt: null } });
    if (!role) {
      throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Role not found." });
    }
    if (role.isDefault) {
      throw new ForbiddenException({
        code: "ROLE_DEFAULT_IMMUTABLE",
        message: "Default roles cannot be renamed or deleted, only have their permissions adjusted.",
      });
    }
    return role;
  }
}
