import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { TargetMarginService } from "./target-margin.service";
import { CreateTargetMarginDto } from "./dto/create-target-margin.dto";
import { ListTargetMarginsDto } from "./dto/list-target-margins.dto";
import { PaginatedTargetMarginResponseDto, TargetMarginResponseDto } from "./dto/target-margin-response.dto";

/**
 * Target margin governance (docs/01_BUSINESS_RULES.md §6). Configuration
 * group, not Master Data — same split rationale as `PeriodModule`. Gated by
 * `tariff.*` per docs/04_RBAC.md's "Tariff & Target Margin" row. Append-only:
 * no update/delete endpoints — a change is always a new row.
 */
@ApiTags("target-margins")
@ApiBearerAuth()
@Controller("target-margins")
export class TargetMarginController {
  constructor(private readonly targetMarginService: TargetMarginService) {}

  @Post()
  @RequirePermissions("tariff.write")
  @ApiOperation({ summary: "Set a target margin for hospital/profit_center/service scope, effective from a period onward." })
  @ApiCreatedResponse({ type: TargetMarginResponseDto })
  @ApiNotFoundResponse({ description: "Period or scope reference (profit center/service) not found." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateTargetMarginDto) {
    return this.targetMarginService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("tariff.read")
  @ApiOperation({ summary: "List target margin history (filter by scope, paginate)." })
  @ApiOkResponse({ type: PaginatedTargetMarginResponseDto })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: ListTargetMarginsDto) {
    return this.targetMarginService.findAll(requireHospitalId(tenant), query);
  }
}
