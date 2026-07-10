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
import { TariffService } from "./tariff.service";
import { CreateTariffDto } from "./dto/create-tariff.dto";
import { UpdateTariffDto } from "./dto/update-tariff.dto";
import { TariffResponseDto, PaginatedTariffResponseDto } from "./dto/tariff-response.dto";

/**
 * Gated by `tariff.read`/`tariff.write` (docs/04_RBAC.md §2) — Tariff already
 * has its own dedicated permission family (plus `tariff.propose`/
 * `tariff.approve`, not used yet: Sprint 3 is basic CRUD only, per
 * `ARCHITECT_AUDIT.md` Sprint 3 — the propose/approve workflow is later scope),
 * unlike every other entity in this module which shares `master_data.*`.
 */
@ApiTags("tariffs")
@ApiBearerAuth()
@Controller("tariffs")
export class TariffController {
  constructor(private readonly tariffService: TariffService) {}

  @Post()
  @RequirePermissions("tariff.write")
  @ApiOperation({ summary: "Set a new tariff for a service (supersedes the prior active tariff)." })
  @ApiOkResponse({ type: TariffResponseDto })
  @ApiConflictResponse({ description: "A conflicting tariff row already exists for this service." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateTariffDto) {
    return this.tariffService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("tariff.read")
  @ApiOperation({ summary: "List tariff history (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedTariffResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[status]=active". Filterable fields: serviceId, status.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.tariffService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("tariff.read")
  @ApiOperation({ summary: "Get a tariff row by id." })
  @ApiParam({ name: "id", description: "Tariff row id." })
  @ApiOkResponse({ type: TariffResponseDto })
  @ApiNotFoundResponse({ description: "Tariff row not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.tariffService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("tariff.write")
  @ApiOperation({ summary: "Update a tariff row's recommended value or effective date (not the active tariff value itself)." })
  @ApiParam({ name: "id", description: "Tariff row id." })
  @ApiOkResponse({ type: TariffResponseDto })
  @ApiNotFoundResponse({ description: "Tariff row not found." })
  @ApiConflictResponse({ description: "A conflicting tariff row already exists for this service." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateTariffDto
  ) {
    return this.tariffService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("tariff.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a tariff row." })
  @ApiParam({ name: "id", description: "Tariff row id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Tariff row not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.tariffService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
