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
import { DoctorService } from "./doctor.service";
import { CreateDoctorDto } from "./dto/create-doctor.dto";
import { UpdateDoctorDto } from "./dto/update-doctor.dto";
import { DoctorResponseDto, PaginatedDoctorResponseDto } from "./dto/doctor-response.dto";

/**
 * The doctor roster itself (code/name/specialty) — gated by `master_data.*`
 * like every other entity here. The `doctor_analytics.read_detail`
 * restriction (docs/04_RBAC.md §5, docs/01_BUSINESS_RULES.md §7) is about
 * doctor-*identified cost/profitability* data in the analytics module, which
 * doesn't exist yet (Sprint 8) — it doesn't gate this basic directory.
 */
@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors")
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create a doctor." })
  @ApiOkResponse({ type: DoctorResponseDto })
  @ApiConflictResponse({ description: "Doctor code already exists." })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateDoctorDto) {
    return this.doctorService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List doctors (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: PaginatedDoctorResponseDto })
  @ApiQuery({
    name: "filter",
    required: false,
    style: "deepObject",
    explode: true,
    description: 'Exact-match filter, e.g. "filter[status]=active". Filterable fields: specialty, status.',
  })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.doctorService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a doctor by id." })
  @ApiParam({ name: "id", description: "Doctor id." })
  @ApiOkResponse({ type: DoctorResponseDto })
  @ApiNotFoundResponse({ description: "Doctor not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.doctorService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a doctor." })
  @ApiParam({ name: "id", description: "Doctor id." })
  @ApiOkResponse({ type: DoctorResponseDto })
  @ApiNotFoundResponse({ description: "Doctor not found." })
  @ApiConflictResponse({ description: "Doctor code already exists." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateDoctorDto
  ) {
    return this.doctorService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a doctor." })
  @ApiParam({ name: "id", description: "Doctor id." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: "Doctor not found." })
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.doctorService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
