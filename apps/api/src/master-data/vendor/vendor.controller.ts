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
import { VendorService } from "./vendor.service";
import { CreateVendorDto } from "./dto/create-vendor.dto";
import { UpdateVendorDto } from "./dto/update-vendor.dto";
import { VendorResponseDto, PaginatedVendorResponseDto } from "./dto/vendor-response.dto";

@ApiTags("vendors")
@ApiBearerAuth()
@Controller("vendors")
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create a vendor." })
  @ApiOkResponse({ type: VendorResponseDto })
  @ApiConflictResponse({ description: "Vendor code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateVendorDto) {
    return this.vendorService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List vendors (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedVendorResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[status]=active". Filterable fields: category, status.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.vendorService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a vendor by id." })
  @ApiParam({ name: "id", description: "Vendor id." })
  @ApiOkResponse({ type: VendorResponseDto })
  @ApiNotFoundResponse({ description: "Vendor not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.vendorService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a vendor." })
  @ApiParam({ name: "id", description: "Vendor id." })
  @ApiOkResponse({ type: VendorResponseDto })
  @ApiNotFoundResponse({ description: "Vendor not found." })
  @ApiConflictResponse({ description: "Vendor code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateVendorDto
  ) {
    return this.vendorService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a vendor." })
  @ApiParam({ name: "id", description: "Vendor id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Vendor not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.vendorService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
