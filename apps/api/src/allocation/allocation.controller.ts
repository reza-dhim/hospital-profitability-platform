import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { AllocationRunService } from "./allocation-run.service";
import { CreateAllocationRunDto } from "./dto/create-allocation-run.dto";
import { ListAllocationRunsDto } from "./dto/list-allocation-runs.dto";
import { AllocationRunResponseDto, PaginatedAllocationRunResponseDto } from "./dto/allocation-run-response.dto";
import { PaginatedAllocatedCostResponseDto } from "./dto/allocated-cost-response.dto";

/**
 * Cost allocation runs (docs/08_COST_ALLOCATION_ENGINE.md). Gated by
 * `cost_allocation.*` (docs/04_RBAC.md §2). `create()`/`recalculate()`
 * enqueue a real BullMQ job (`AllocationEngineService`, Sprint 5 sub-task 4)
 * that runs Direct/Step-Down against real data and transitions the run to
 * `completed`/`failed`.
 */
@ApiTags("allocation-runs")
@ApiBearerAuth()
@Controller("allocation-runs")
export class AllocationController {
  constructor(private readonly allocationRunService: AllocationRunService) {}

  @Post()
  @RequirePermissions("cost_allocation.write")
  @ApiOperation({ summary: "Create a draft allocation run for a period and run it." })
  @ApiCreatedResponse({ type: AllocationRunResponseDto })
  @ApiNotFoundResponse({ description: "Period not found." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateAllocationRunDto) {
    return this.allocationRunService.create(requireHospitalId(tenant), tenant.organizationId, dto, user.sub);
  }

  @Get()
  @RequirePermissions("cost_allocation.read")
  @ApiOperation({ summary: "List allocation runs (filter by status/period, paginate)." })
  @ApiOkResponse({ type: PaginatedAllocationRunResponseDto })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: ListAllocationRunsDto) {
    return this.allocationRunService.findAll(requireHospitalId(tenant), query);
  }

  @Get(":id")
  @RequirePermissions("cost_allocation.read")
  @ApiOperation({ summary: "Get an allocation run by id." })
  @ApiParam({ name: "id", description: "Allocation run id." })
  @ApiOkResponse({ type: AllocationRunResponseDto })
  @ApiNotFoundResponse({ description: "Allocation run not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.allocationRunService.findOne(requireHospitalId(tenant), id);
  }

  @Get(":id/allocated-costs")
  @RequirePermissions("cost_allocation.read")
  @ApiOperation({ summary: "List the allocated_costs rows produced by a run, paginated." })
  @ApiParam({ name: "id", description: "Allocation run id." })
  @ApiOkResponse({ type: PaginatedAllocatedCostResponseDto })
  @ApiNotFoundResponse({ description: "Allocation run not found." })
  findAllocatedCosts(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Query() query: PaginationQueryDto) {
    return this.allocationRunService.findAllocatedCosts(requireHospitalId(tenant), id, query);
  }

  @Post(":id/recalculate")
  @RequirePermissions("cost_allocation.write")
  @ApiOperation({ summary: "Recalculate a completed/failed run — creates a new run superseding it, never mutates the prior one." })
  @ApiParam({ name: "id", description: "Allocation run id to supersede." })
  @ApiCreatedResponse({ type: AllocationRunResponseDto })
  @ApiNotFoundResponse({ description: "Allocation run not found." })
  @ApiConflictResponse({ description: "Run is not completed/failed, or has already been superseded." })
  @ApiUnprocessableEntityResponse({ description: "Period is not open." })
  recalculate(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.allocationRunService.recalculate(requireHospitalId(tenant), tenant.organizationId, id, user.sub);
  }
}
