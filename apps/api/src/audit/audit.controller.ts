import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { AuditService } from "./audit.service";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import { AuditLogResponseDto } from "./dto/audit-log-response.dto";

/** Read API over `audit_logs`: docs/23_AUDIT_TRAIL.md §4. */
@ApiTags("audit-logs")
@ApiBearerAuth()
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions("audit.read")
  @ApiOperation({ summary: "List audit trail entries for the caller's active hospital." })
  @ApiOkResponse({ type: [AuditLogResponseDto] })
  findAll(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Query() query: AuditLogQueryDto) {
    return this.auditService.findAll(tenant.hospitalId, user, query);
  }
}
