import { Module } from "@nestjs/common";
import { RoleService } from "./role.service";
import { RoleController } from "./role.controller";
import { PermissionService } from "./permission.service";
import { PermissionController } from "./permission.controller";

/** Role/Permission management, docs/04_RBAC.md. Depends on TenancyModule's TenantGuard/@CurrentTenant already having run. */
@Module({
  controllers: [RoleController, PermissionController],
  providers: [RoleService, PermissionService],
})
export class RbacModule {}
