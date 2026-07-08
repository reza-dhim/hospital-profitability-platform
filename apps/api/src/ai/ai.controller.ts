import { Controller, Post } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** docs/12_AI_ENGINE.md, docs/13_AI_GOVERNANCE.md. Implemented in Sprint 9. */
@ApiTags("ai")
@Controller("ai")
export class AiController {
  @Post("insights")
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 9 — docs/12_AI_ENGINE.md" })
  insights() {
    notImplemented("AI");
  }
}
