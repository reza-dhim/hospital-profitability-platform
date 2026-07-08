import { Controller, Get } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** Pipeline: docs/06_UPLOAD_ENGINE.md. Implemented in Sprint 4. */
@ApiTags("uploads")
@Controller("uploads")
export class UploadController {
  @Get()
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 4 — docs/06_UPLOAD_ENGINE.md" })
  list() {
    notImplemented("Upload");
  }
}
