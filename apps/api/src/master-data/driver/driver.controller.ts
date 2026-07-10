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
import { DriverService } from "./driver.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { UpdateDriverDto } from "./dto/update-driver.dto";
import { DriverResponseDto, PaginatedDriverResponseDto } from "./dto/driver-response.dto";

@ApiTags("drivers")
@ApiBearerAuth()
@Controller("drivers")
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create an allocation driver." })
  @ApiOkResponse({ type: DriverResponseDto })
  @ApiConflictResponse({ description: "Driver code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateDriverDto) {
    return this.driverService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List drivers (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedDriverResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[unit]=hours". Filterable fields: unit.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.driverService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a driver by id." })
  @ApiParam({ name: "id", description: "Driver id." })
  @ApiOkResponse({ type: DriverResponseDto })
  @ApiNotFoundResponse({ description: "Driver not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.driverService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a driver." })
  @ApiParam({ name: "id", description: "Driver id." })
  @ApiOkResponse({ type: DriverResponseDto })
  @ApiNotFoundResponse({ description: "Driver not found." })
  @ApiConflictResponse({ description: "Driver code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateDriverDto
  ) {
    return this.driverService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a driver." })
  @ApiParam({ name: "id", description: "Driver id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Driver not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.driverService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
