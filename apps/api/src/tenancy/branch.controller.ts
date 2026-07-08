import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { CurrentTenant } from "./current-tenant.decorator";
import type { TenantContext } from "./tenant-context";
import { BranchService } from "./branch.service";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { UpdateBranchDto } from "./dto/update-branch.dto";
import { BranchResponseDto } from "./dto/branch-response.dto";

/** docs/03_MULTI_TENANT.md §1: optional physical-site tagging under the caller's effective hospital. */
@ApiTags("branches")
@ApiBearerAuth()
@Controller("branches")
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @RequirePermissions("branch.write")
  @ApiOperation({ summary: "Create a branch under the caller's active hospital." })
  @ApiOkResponse({ type: BranchResponseDto })
  create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateBranchDto) {
    return this.branchService.create(tenant.hospitalId, dto, user.sub);
  }

  @Get()
  @RequirePermissions("branch.read")
  @ApiOperation({ summary: "List branches in the caller's active hospital." })
  @ApiOkResponse({ type: [BranchResponseDto] })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.branchService.findAll(tenant.hospitalId, query);
  }

  @Get(":id")
  @RequirePermissions("branch.read")
  @ApiOperation({ summary: "Get a branch by id." })
  @ApiOkResponse({ type: BranchResponseDto })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.branchService.findOne(tenant.hospitalId, id);
  }

  @Patch(":id")
  @RequirePermissions("branch.write")
  @ApiOperation({ summary: "Update a branch." })
  @ApiOkResponse({ type: BranchResponseDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateBranchDto
  ) {
    return this.branchService.update(tenant.hospitalId, id, dto, user.sub);
  }

  @Delete(":id")
  @RequirePermissions("branch.write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a branch." })
  @ApiNoContentResponse()
  async remove(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.branchService.remove(tenant.hospitalId, id, user.sub);
  }
}
