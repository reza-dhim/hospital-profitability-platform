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
import { BmhpItemService } from "./bmhp-item.service";
import { CreateBmhpItemDto } from "./dto/create-bmhp-item.dto";
import { UpdateBmhpItemDto } from "./dto/update-bmhp-item.dto";
import { BmhpItemResponseDto, PaginatedBmhpItemResponseDto } from "./dto/bmhp-item-response.dto";

/** Bahan Medis Habis Pakai — consumable medical materials (docs/02_DOMAIN_MODEL.md). */
@ApiTags("bmhp-items")
@ApiBearerAuth()
@Controller("bmhp-items")
export class BmhpItemController {
  constructor(private readonly bmhpItemService: BmhpItemService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create a BMHP (consumable medical material) item." })
  @ApiOkResponse({ type: BmhpItemResponseDto })
  @ApiConflictResponse({ description: "BMHP item code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateBmhpItemDto) {
    return this.bmhpItemService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List BMHP items (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedBmhpItemResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[status]=active". Filterable fields: vendorId, status.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.bmhpItemService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a BMHP item by id." })
  @ApiParam({ name: "id", description: "BMHP item id." })
  @ApiOkResponse({ type: BmhpItemResponseDto })
  @ApiNotFoundResponse({ description: "BMHP item not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.bmhpItemService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a BMHP item." })
  @ApiParam({ name: "id", description: "BMHP item id." })
  @ApiOkResponse({ type: BmhpItemResponseDto })
  @ApiNotFoundResponse({ description: "BMHP item not found." })
  @ApiConflictResponse({ description: "BMHP item code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateBmhpItemDto
  ) {
    return this.bmhpItemService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a BMHP item." })
  @ApiParam({ name: "id", description: "BMHP item id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "BMHP item not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.bmhpItemService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
