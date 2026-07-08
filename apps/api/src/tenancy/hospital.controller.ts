import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { CurrentTenant } from "./current-tenant.decorator";
import type { TenantContext } from "./tenant-context";
import { HospitalService } from "./hospital.service";
import { CreateHospitalDto } from "./dto/create-hospital.dto";
import { UpdateHospitalDto } from "./dto/update-hospital.dto";
import { HospitalResponseDto } from "./dto/hospital-response.dto";

/** docs/03_MULTI_TENANT.md §1: the data-ownership boundary for master data. */
@ApiTags("hospitals")
@ApiBearerAuth()
@Controller("hospitals")
export class HospitalController {
  constructor(private readonly hospitalService: HospitalService) {}

  @Post()
  @RequirePermissions("hospital.write")
  @ApiOperation({ summary: "Create a hospital under the caller's organization." })
  @ApiOkResponse({ type: HospitalResponseDto })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateHospitalDto) {
    return this.hospitalService.create(tenant.organizationId, dto, user.sub);
  }

  @Get()
  @RequirePermissions("hospital.read")
  @ApiOperation({ summary: "List hospitals in the caller's organization." })
  @ApiOkResponse({ type: [HospitalResponseDto] })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.hospitalService.findAll(tenant.organizationId, query);
  }

  @Get(":id")
  @RequirePermissions("hospital.read")
  @ApiOperation({ summary: "Get a hospital by id." })
  @ApiOkResponse({ type: HospitalResponseDto })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.hospitalService.findOne(tenant.organizationId, id);
  }

  @Patch(":id")
  @RequirePermissions("hospital.write")
  @ApiOperation({ summary: "Update a hospital." })
  @ApiOkResponse({ type: HospitalResponseDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateHospitalDto
  ) {
    return this.hospitalService.update(tenant.organizationId, id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("hospital.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a hospital." })
  @ApiNoContentResponse()
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.hospitalService.remove(tenant.organizationId, id, user.sub);
  }
}
