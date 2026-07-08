import { Controller, Get } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** Full CRUD per docs/22_ACCEPTANCE_CRITERIA.md §2. Implemented in Sprint 3. */
@ApiTags("master-data")
@Controller("cost-centers")
export class MasterDataController {
  @Get()
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 3 — docs/02_DOMAIN_MODEL.md" })
  list() {
    notImplemented("Master Data");
  }
}
