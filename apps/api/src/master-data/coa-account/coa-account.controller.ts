import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../auth/decorators/permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../../auth/types/jwt-payload.type";
import { CurrentTenant } from "../../tenancy/current-tenant.decorator";
import type { TenantContext } from "../../tenancy/tenant-context";
import { requireHospitalId } from "../../common/tenant-scope.util";
import { ListQueryDto } from "../../common/dto/list-query.dto";
import { CoaAccountService } from "./coa-account.service";
import { CreateCoaAccountDto } from "./dto/create-coa-account.dto";
import { UpdateCoaAccountDto } from "./dto/update-coa-account.dto";
import { CoaAccountResponseDto } from "./dto/coa-account-response.dto";

@ApiTags("coa-accounts")
@ApiBearerAuth()
@Controller("coa-accounts")
export class CoaAccountController {
  constructor(private readonly coaAccountService: CoaAccountService) {}

  @Post()
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Create a chart-of-accounts entry." })
  @ApiOkResponse({ type: CoaAccountResponseDto })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateCoaAccountDto) {
    return this.coaAccountService.create(requireHospitalId(tenant), dto, user.sub);
  }

  @Get()
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "List chart-of-accounts entries (search/filter/sort/paginate)." })
  @ApiOkResponse({ type: [CoaAccountResponseDto] })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListQueryDto,
    @Query("filter") filter?: Record<string, string>
  ) {
    return this.coaAccountService.findAll(requireHospitalId(tenant), { ...query, filter });
  }

  @Get(":id")
  @RequirePermissions("master_data.read")
  @ApiOperation({ summary: "Get a chart-of-accounts entry by id." })
  @ApiOkResponse({ type: CoaAccountResponseDto })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.coaAccountService.findOne(requireHospitalId(tenant), id);
  }

  @Patch(":id")
  @RequirePermissions("master_data.write")
  @ApiOperation({ summary: "Update a chart-of-accounts entry." })
  @ApiOkResponse({ type: CoaAccountResponseDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateCoaAccountDto
  ) {
    return this.coaAccountService.update(requireHospitalId(tenant), id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("master_data.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a chart-of-accounts entry." })
  @ApiNoContentResponse()
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.coaAccountService.remove(requireHospitalId(tenant), id, user.sub);
  }
}
