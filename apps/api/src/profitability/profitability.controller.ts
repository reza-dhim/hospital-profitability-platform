import { Controller, Get } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** docs/09_PROFITABILITY_ENGINE.md, docs/10_UNIT_COST_ENGINE.md. Implemented in Sprint 6. */
@ApiTags("profitability")
@Controller("profitability")
export class ProfitabilityController {
  @Get("summary")
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 6 — docs/09_PROFITABILITY_ENGINE.md" })
  summary() {
    notImplemented("Profitability");
  }
}
