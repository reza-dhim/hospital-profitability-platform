import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { PeriodService } from "./period.service";
import { GeneratePeriodsDto } from "./dto/generate-periods.dto";
import { ReopenPeriodDto } from "./dto/reopen-period.dto";
import { ListPeriodsDto } from "./dto/list-periods.dto";
import { PeriodResponseDto, PaginatedPeriodResponseDto } from "./dto/period-response.dto";

/** Period lifecycle (docs/25_PERIOD_CLOSING.md). Gated by `period_closing.*` (docs/04_RBAC.md §2). */
@ApiTags("periods")
@ApiBearerAuth()
@Controller("periods")
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Post("generate")
  @RequirePermissions("period_closing.write")
  @ApiOperation({ summary: "Generate a fiscal year of monthly draft periods." })
  @ApiOkResponse({ type: [PeriodResponseDto] })
  @ApiConflictResponse({ description: "One or more periods already exist for this hospital and fiscal year." })
  generate(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: GeneratePeriodsDto) {
    return this.periodService.generate(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("period_closing.read")
  @ApiOperation({ summary: "List periods (filter by status, paginate)." })
  @ApiOkResponse({ type: PaginatedPeriodResponseDto })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: ListPeriodsDto) {
    return this.periodService.findAll(requireHospitalId(tenant), query);
  }

  @Get(":id")
  @RequirePermissions("period_closing.read")
  @ApiOperation({ summary: "Get a period by id." })
  @ApiParam({ name: "id", description: "Period id." })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiNotFoundResponse({ description: "Period not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.periodService.findOne(requireHospitalId(tenant), id);
  }

  @Post(":id/open")
  @RequirePermissions("period_closing.write")
  @ApiOperation({ summary: "Open a draft period (manual escape hatch — see docs/25_PERIOD_CLOSING.md §1)." })
  @ApiParam({ name: "id", description: "Period id." })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiNotFoundResponse({ description: "Period not found." })
  @ApiConflictResponse({ description: "Period is not in 'draft' status." })
  open(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.periodService.open(requireHospitalId(tenant), id, user.sub);
  }

  @Post(":id/lock")
  @RequirePermissions("period_closing.write")
  @ApiOperation({ summary: "Lock an open period." })
  @ApiParam({ name: "id", description: "Period id." })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiNotFoundResponse({ description: "Period not found." })
  @ApiConflictResponse({ description: "Period is not in 'open' status." })
  lock(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.periodService.lock(requireHospitalId(tenant), id, user.sub);
  }

  @Post(":id/close")
  @RequirePermissions("period_closing.write")
  @ApiOperation({ summary: "Close a locked period." })
  @ApiParam({ name: "id", description: "Period id." })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiNotFoundResponse({ description: "Period not found." })
  @ApiConflictResponse({ description: "Period is not in 'locked' status." })
  close(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.periodService.close(requireHospitalId(tenant), id, user.sub);
  }

  @Post(":id/reopen")
  @RequirePermissions("period_closing.reopen")
  @ApiOperation({ summary: "Reopen a locked or closed period (System Admin only, requires a reason)." })
  @ApiParam({ name: "id", description: "Period id." })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiNotFoundResponse({ description: "Period not found." })
  @ApiConflictResponse({ description: "Period is not in 'locked' or 'closed' status." })
  reopen(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ReopenPeriodDto
  ) {
    return this.periodService.reopen(requireHospitalId(tenant), id, dto, user.sub);
  }
}
