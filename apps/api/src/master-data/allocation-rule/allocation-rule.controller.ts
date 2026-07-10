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
import { AllocationRuleService } from "./allocation-rule.service";
import { CreateAllocationRuleDto } from "./dto/create-allocation-rule.dto";
import { UpdateAllocationRuleDto } from "./dto/update-allocation-rule.dto";
import { AllocationRuleResponseDto, PaginatedAllocationRuleResponseDto } from "./dto/allocation-rule-response.dto";

/** Master-data configuration consumed by the Sprint 5 Cost Allocation Engine (docs/08_COST_ALLOCATION_ENGINE.md). */
@ApiTags("allocation-rules")
@ApiBearerAuth()
@Controller("allocation-rules")
export class AllocationRuleController {
  constructor(private readonly allocationRuleService: AllocationRuleService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create an allocation rule." })
  @ApiOkResponse({ type: AllocationRuleResponseDto })
  @ApiConflictResponse({ description: "An allocation rule for this cost center, driver, and period already exists." })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAllocationRuleDto
  ) {
    return this.allocationRuleService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List allocation rules (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedAllocationRuleResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description:
      'Exact-match filter, e.g. "filter[method]=direct". Filterable fields: costCenterId, driverId, effectivePeriod, method.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.allocationRuleService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get an allocation rule by id." })
  @ApiParam({ name: "id", description: "Allocation rule id." })
  @ApiOkResponse({ type: AllocationRuleResponseDto })
  @ApiNotFoundResponse({ description: "Allocation rule not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.allocationRuleService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update an allocation rule." })
  @ApiParam({ name: "id", description: "Allocation rule id." })
  @ApiOkResponse({ type: AllocationRuleResponseDto })
  @ApiNotFoundResponse({ description: "Allocation rule not found." })
  @ApiConflictResponse({ description: "An allocation rule for this cost center, driver, and period already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateAllocationRuleDto
  ) {
    return this.allocationRuleService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete an allocation rule." })
  @ApiParam({ name: "id", description: "Allocation rule id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Allocation rule not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.allocationRuleService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
