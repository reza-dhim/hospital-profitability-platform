import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { PermissionService } from "./permission.service";
import { PermissionResponseDto } from "./dto/permission-response.dto";

/** docs/04_RBAC.md §3: the permission catalog is code/seed-defined — read-only here by design. */
@ApiTags("permissions")
@ApiBearerAuth()
@Controller("permissions")
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @RequirePermissions("rbac.read")
  @ApiOperation({ summary: "List the permission catalog, optionally filtered by module." })
  @ApiQuery({ name: "module", required: false })
  @ApiOkResponse({ type: [PermissionResponseDto] })
  findAll(@Query("module") module?: string) {
    return this.permissionService.findAll(module);
  }
}
