import { Controller, Get, Param, ParseEnumPipe, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProduces, ApiTags } from "@nestjs/swagger";
import { UploadType } from "@prisma/client";
import type { Response } from "express";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { TemplateService } from "./template.service";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** docs/06_UPLOAD_ENGINE.md §1, pipeline step 1. Gated by `upload.read` — downloading a template isn't a mutation. */
@ApiTags("templates")
@ApiBearerAuth()
@Controller("templates")
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get(":type/download")
  @RequirePermissions("upload.read")
  @ApiOperation({ summary: "Download the current upload template for a given type." })
  @ApiParam({ name: "type", enum: UploadType })
  @ApiProduces(XLSX_CONTENT_TYPE)
  async download(
    @Param("type", new ParseEnumPipe(UploadType)) type: UploadType,
    @Res() res: Response
  ): Promise<void> {
    const buffer = await this.templateService.generate(type);
    res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${type}-template.xlsx"`);
    res.send(buffer);
  }
}
