import { Controller, Get } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** Read API over audit_logs: docs/23_AUDIT_TRAIL.md §4. Implemented in Sprint 2. */
@ApiTags("audit-logs")
@Controller("audit-logs")
export class AuditController {
  @Get()
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 2 — docs/23_AUDIT_TRAIL.md" })
  list() {
    notImplemented("Audit");
  }
}
