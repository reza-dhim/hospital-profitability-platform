import { Controller, Get } from "@nestjs/common";
import { ApiNotImplementedResponse, ApiTags } from "@nestjs/swagger";
import { notImplemented } from "../common/not-implemented";

/** docs/11_DOCTOR_ANALYTICS.md. Implemented in Sprint 8. */
@ApiTags("doctor-analytics")
@Controller("doctor-analytics")
export class DoctorAnalyticsController {
  @Get("summary")
  @ApiNotImplementedResponse({ description: "Implemented in Sprint 8 — docs/11_DOCTOR_ANALYTICS.md" })
  summary() {
    notImplemented("Doctor Analytics");
  }
}
