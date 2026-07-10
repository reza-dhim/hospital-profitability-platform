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
import { CostCenterService } from "./cost-center.service";
import { CreateCostCenterDto } from "./dto/create-cost-center.dto";
import { UpdateCostCenterDto } from "./dto/update-cost-center.dto";
import { CostCenterResponseDto, PaginatedCostCenterResponseDto } from "./dto/cost-center-response.dto";

/**
 * Proof-of-concept consumer of the generic CRUD engine
 * (`common/crud/master-data-crud.service.ts`) — docs/ARCHITECT_AUDIT.md
 * Sprint 3, docs/22_ACCEPTANCE_CRITERIA.md §2.
 */
@ApiTags("cost-centers")
@ApiBearerAuth()
@Controller("cost-centers")
export class CostCenterController {
  constructor(private readonly costCenterService: CostCenterService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create a cost center." })
  @ApiOkResponse({ type: CostCenterResponseDto })
  @ApiConflictResponse({ description: "Cost center code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateCostCenterDto) {
    return this.costCenterService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List cost centers (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedCostCenterResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[status]=active". Filterable fields: type, status.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.costCenterService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a cost center by id." })
  @ApiParam({ name: "id", description: "Cost center id." })
  @ApiOkResponse({ type: CostCenterResponseDto })
  @ApiNotFoundResponse({ description: "Cost center not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.costCenterService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a cost center." })
  @ApiParam({ name: "id", description: "Cost center id." })
  @ApiOkResponse({ type: CostCenterResponseDto })
  @ApiNotFoundResponse({ description: "Cost center not found." })
  @ApiConflictResponse({ description: "Cost center code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateCostCenterDto
  ) {
    return this.costCenterService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a cost center." })
  @ApiParam({ name: "id", description: "Cost center id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Cost center not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.costCenterService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
