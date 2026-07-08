import { Controller, Get } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** docs/15_REPORTING.md. Implemented in Sprint 10. */
@ApiTags("reports")
@Controller("reports")
export class ReportingController {
  @Get("executive/pdf")
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 10 — docs/15_REPORTING.md" })
  executivePdf() {
    notImplemented("Reporting");
  }
}
