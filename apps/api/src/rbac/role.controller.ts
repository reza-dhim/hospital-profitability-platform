import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { RoleService } from "./role.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { AssignRolePermissionsDto } from "./dto/assign-role-permissions.dto";
import { RoleResponseDto } from "./dto/role-response.dto";

/** docs/04_RBAC.md §1: roles are hospital-scoped named bundles of permissions. */
@ApiTags("roles")
@ApiBearerAuth()
@Controller("roles")
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @RequirePermissions("rbac.write")
  @ApiOperation({ summary: "Create a custom role in the caller's active hospital." })
  @ApiOkResponse({ type: RoleResponseDto })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateRoleDto) {
    return this.requireHospital(tenant, (hospitalId) => this.roleService.create(hospitalId, dto, user.sub));
  }

  @Get()
  @RequirePermissions("rbac.read")
  @ApiOperation({ summary: "List roles in the caller's active hospital." })
  @ApiOkResponse({ type: [RoleResponseDto] })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.requireHospital(tenant, (hospitalId) => this.roleService.findAll(hospitalId, query));
  }

  @Get(":id")
  @RequirePermissions("rbac.read")
  @ApiOperation({ summary: "Get a role by id." })
  @ApiOkResponse({ type: RoleResponseDto })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.requireHospital(tenant, (hospitalId) => this.roleService.findOne(hospitalId, id));
  }

  @Patch(":id")
  @RequirePermissions("rbac.write")
  @ApiOperation({ summary: "Rename/redescribe a custom role (default roles cannot be renamed)." })
  @ApiOkResponse({ type: RoleResponseDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto
  ) {
    return this.requireHospital(tenant, (hospitalId) => this.roleService.update(hospitalId, id, dto, user.sub));
  }

  @Put(":id/permissions")
  @RequirePermissions("rbac.write")
  @ApiOperation({ summary: "Replace a role's permission set (allowed for default roles too, per docs/04_RBAC.md §1)." })
  @ApiOkResponse({ type: RoleResponseDto })
  assignPermissions(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: AssignRolePermissionsDto
  ) {
    return this.requireHospital(tenant, (hospitalId) =>
      this.roleService.assignPermissions(hospitalId, id, dto.permissionCodes, user.sub)
    );
  }

  @Delete(":id")
  @RequirePermissions("rbac.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a custom role (default roles cannot be deleted)." })
  @ApiNoContentResponse()
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.requireHospital(tenant, (hospitalId) => this.roleService.remove(hospitalId, id, user.sub));
  }

  private requireHospital<T>(tenant: TenantContext, fn: (hospitalId: string) => Promise<T>): Promise<T> {
    if (!tenant.hospitalId) {
      throw new BadRequestException({
        code: "TENANT_HOSPITAL_REQUIRED",
        message: "This action requires an active hospital context (switch hospital via the X-Hospital-Id header).",
      });
    }
    return fn(tenant.hospitalId);
  }
}
