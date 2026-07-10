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
import { MedicalServiceService } from "./service.service";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";
import { ServiceResponseDto, PaginatedServiceResponseDto } from "./dto/service-response.dto";

@ApiTags("services")
@ApiBearerAuth()
@Controller("services")
export class ServiceController {
  constructor(private readonly serviceService: MedicalServiceService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create a billable service." })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiConflictResponse({ description: "Service code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateServiceDto) {
    return this.serviceService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List services (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedServiceResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description:
      'Exact-match filter, e.g. "filter[serviceType]=consultation". Filterable fields: profitCenterId, serviceType.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.serviceService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a service by id." })
  @ApiParam({ name: "id", description: "Service id." })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ description: "Service not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.serviceService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a service." })
  @ApiParam({ name: "id", description: "Service id." })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ description: "Service not found." })
  @ApiConflictResponse({ description: "Service code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateServiceDto
  ) {
    return this.serviceService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a service." })
  @ApiParam({ name: "id", description: "Service id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Service not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.serviceService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
