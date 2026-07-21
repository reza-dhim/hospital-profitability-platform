import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiNotFoundResponse, ApiNotImplementedResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { WhatIfSimulationService } from "./what-if-simulation.service";
import { WhatIfSimulationRequestDto } from "./dto/what-if-simulation-request.dto";
import { WhatIfSimulationResponseDto } from "./dto/what-if-simulation-response.dto";

/** docs/12_AI_ENGINE.md, docs/13_AI_GOVERNANCE.md. `insights` is Sprint 9 (still a stub); `what-if` (docs/12_AI_ENGINE.md §4) needs no AI/LLM call — pure deterministic recomputation, implemented ahead of Sprint 9. */
@ApiTags("ai")
@ApiBearerAuth()
@Controller("ai")
export class AiController {
  constructor(private readonly whatIfSimulationService: WhatIfSimulationService) {}

  @Post("insights")
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 9 — docs/12_AI_ENGINE.md" })
  insights() {
    notImplemented("AI");
  }

  @Post("what-if")
  @RequirePermissions("ai.use")
  @ApiOperation({
    summary:
      "Recompute profitability figures for one service with a hypothetical tariff and/or volume. " +
      "docs/12_AI_ENGINE.md §4 — pure in-memory recomputation of existing formulas, never persisted.",
  })
  @ApiOkResponse({ type: WhatIfSimulationResponseDto })
  @ApiNotFoundResponse({ description: "Allocation run or service not found." })
  @ApiUnprocessableEntityResponse({ description: "Neither hypotheticalTariff nor hypotheticalVolume was provided." })
  whatIf(@CurrentTenant() tenant: TenantContext, @Body() dto: WhatIfSimulationRequestDto) {
    return this.whatIfSimulationService.simulate(requireHospitalId(tenant), dto);
  }
}
