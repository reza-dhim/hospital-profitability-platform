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
import { AssetService } from "./asset.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { UpdateAssetDto } from "./dto/update-asset.dto";
import { AssetResponseDto, PaginatedAssetResponseDto } from "./dto/asset-response.dto";

@ApiTags("assets")
@ApiBearerAuth()
@Controller("assets")
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create an asset." })
  @ApiOkResponse({ type: AssetResponseDto })
  @ApiConflictResponse({ description: "Asset code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateAssetDto) {
    return this.assetService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List assets (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedAssetResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[status]=active". Filterable fields: category, costCenterId, status.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.assetService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get an asset by id." })
  @ApiParam({ name: "id", description: "Asset id." })
  @ApiOkResponse({ type: AssetResponseDto })
  @ApiNotFoundResponse({ description: "Asset not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.assetService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update an asset." })
  @ApiParam({ name: "id", description: "Asset id." })
  @ApiOkResponse({ type: AssetResponseDto })
  @ApiNotFoundResponse({ description: "Asset not found." })
  @ApiConflictResponse({ description: "Asset code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateAssetDto
  ) {
    return this.assetService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete an asset." })
  @ApiParam({ name: "id", description: "Asset id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Asset not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.assetService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
