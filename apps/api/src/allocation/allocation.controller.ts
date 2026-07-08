import { Controller, Get } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** Algorithm: docs/08_COST_ALLOCATION_ENGINE.md. Implemented in Sprint 5. */
@ApiTags("allocation-runs")
@Controller("allocation-runs")
export class AllocationController {
  @Get()
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 5 — docs/08_COST_ALLOCATION_ENGINE.md" })
  list() {
    notImplemented("Allocation");
  }
}
