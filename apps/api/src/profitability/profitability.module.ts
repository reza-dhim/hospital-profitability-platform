import { Module } from "@nestjs/common";
import { TargetMarginModule } from "../target-margin/target-margin.module";
import { DoctorAnalyticsModule } from "../doctor-analytics/doctor-analytics.module";
import { ProfitabilityController } from "./profitability.controller";
import { ProfitabilityEngineService } from "./profitability-engine.service";
import { ProfitabilityQueryService } from "./profitability-query.service";

@Module({
  imports: [TargetMarginModule, DoctorAnalyticsModule],
  controllers: [ProfitabilityController],
  providers: [ProfitabilityEngineService, ProfitabilityQueryService],
  exports: [ProfitabilityEngineService],
})
export class ProfitabilityModule {}
