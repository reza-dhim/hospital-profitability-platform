import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { CurrentTenant } from "./current-tenant.decorator";
import type { TenantContext } from "./tenant-context";
import { OrganizationService } from "./organization.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { OrganizationResponseDto } from "./dto/organization-response.dto";

/** docs/03_MULTI_TENANT.md §1: the top-level billing/subscription tenant. */
@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations")
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @RequirePermissions("organization.write")
  @ApiOperation({ summary: "Create a new organization." })
  @ApiOkResponse({ type: OrganizationResponseDto })
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(dto);
  }

  @Get()
  @RequirePermissions("organization.read")
  @ApiOperation({ summary: "List the caller's organization." })
  @ApiOkResponse({ type: [OrganizationResponseDto] })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.organizationService.findAll(tenant.organizationId, query);
  }

  @Get(":id")
  @RequirePermissions("organization.read")
  @ApiOperation({ summary: "Get an organization by id." })
  @ApiOkResponse({ type: OrganizationResponseDto })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.organizationService.findOne(tenant.organizationId, id);
  }

  @Patch(":id")
  @RequirePermissions("organization.write")
  @ApiOperation({ summary: "Update an organization." })
  @ApiOkResponse({ type: OrganizationResponseDto })
  update(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationService.update(tenant.organizationId, id, dto);
  }

  @Delete(":id")
  @RequirePermissions("organization.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete an organization." })
  @ApiNoContentResponse()
  async remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.organizationService.remove(tenant.organizationId, id);
  }
}
