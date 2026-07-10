import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { RequirePermissions } from "../../auth/decorators/permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../../auth/types/jwt-payload.type";
import { CurrentTenant } from "../../tenancy/current-tenant.decorator";
import type { TenantContext } from "../../tenancy/tenant-context";
import { requireHospitalId } from "../../common/tenant-scope.util";
import { ListQueryDto } from "../../common/dto/list-query.dto";
import { ProfitCenterService } from "./profit-center.service";
import { CreateProfitCenterDto } from "./dto/create-profit-center.dto";
import { UpdateProfitCenterDto } from "./dto/update-profit-center.dto";
import { ProfitCenterResponseDto, PaginatedProfitCenterResponseDto } from "./dto/profit-center-response.dto";

@ApiTags("profit-centers")
@ApiBearerAuth()
@Controller("profit-centers")
export class ProfitCenterController {
  constructor(private readonly profitCenterService: ProfitCenterService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create a profit center." })
  @ApiOkResponse({ type: ProfitCenterResponseDto })
  @ApiConflictResponse({ description: "Profit center code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateProfitCenterDto) {
    return this.profitCenterService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List profit centers (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedProfitCenterResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[status]=active". Filterable fields: department, status.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.profitCenterService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a profit center by id." })
  @ApiParam({ name: "id", description: "Profit center id." })
  @ApiOkResponse({ type: ProfitCenterResponseDto })
  @ApiNotFoundResponse({ description: "Profit center not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.profitCenterService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a profit center." })
  @ApiParam({ name: "id", description: "Profit center id." })
  @ApiOkResponse({ type: ProfitCenterResponseDto })
  @ApiNotFoundResponse({ description: "Profit center not found." })
  @ApiConflictResponse({ description: "Profit center code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateProfitCenterDto
  ) {
    return this.profitCenterService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a profit center." })
  @ApiParam({ name: "id", description: "Profit center id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Profit center not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.profitCenterService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
