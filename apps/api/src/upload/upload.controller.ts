import { BadRequestException, Body, Controller, Get, Param, ParseEnumPipe, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger";
import { UploadType } from "@prisma/client";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { UploadService } from "./upload.service";
import { MAX_UPLOAD_FILE_SIZE_CEILING_BYTES } from "./upload.constants";
import { CreateUploadDto } from "./dto/create-upload.dto";
import { ListUploadsDto } from "./dto/list-uploads.dto";
import { UploadResponseDto, PaginatedUploadResponseDto } from "./dto/upload-response.dto";

/** Upload pipeline intake (docs/06_UPLOAD_ENGINE.md §2 steps 1-3). Gated by `upload.read`/`upload.write` (docs/04_RBAC.md §2). */
@ApiTags("uploads")
@ApiBearerAuth()
@Controller("uploads")
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post(":type")
  @RequirePermissions("upload.write")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_FILE_SIZE_CEILING_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a file for parsing/validation (currently: cost, revenue)." })
  @ApiParam({ name: "type", enum: UploadType })
  @ApiOkResponse({ type: UploadResponseDto })
  @ApiUnprocessableEntityResponse({ description: "Target period is not open." })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("type", new ParseEnumPipe(UploadType)) type: UploadType,
    @Body() dto: CreateUploadDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException({ code: "UPLOAD_FILE_REQUIRED", message: "A file is required." });
    }
    return this.uploadService.create(requireHospitalId(tenant), tenant.organizationId, type, dto, file, user.sub);
  }

  @Get()
  @RequirePermissions("upload.read")
  @ApiOperation({ summary: "List upload batches (filter by type/status, paginate)." })
  @ApiOkResponse({ type: PaginatedUploadResponseDto })
  findAll(@CurrentTenant() tenant: TenantContext, @Query() query: ListUploadsDto) {
    return this.uploadService.findAll(requireHospitalId(tenant), query);
  }

  @Get(":id")
  @RequirePermissions("upload.read")
  @ApiOperation({ summary: "Get an upload batch by id." })
  @ApiParam({ name: "id", description: "Upload batch id." })
  @ApiOkResponse({ type: UploadResponseDto })
  @ApiNotFoundResponse({ description: "Upload batch not found." })
  findOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.uploadService.findOne(requireHospitalId(tenant), id);
  }
}
