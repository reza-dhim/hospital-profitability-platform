import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DoctorAnalyticsController } from "./doctor-analytics.controller";
import { DoctorAnalyticsService } from "./doctor-analytics.service";
import { DoctorProfitabilityEngineService } from "./doctor-profitability-engine.service";

@Module({
  imports: [AuthModule],
  controllers: [DoctorAnalyticsController],
  providers: [DoctorProfitabilityEngineService, DoctorAnalyticsService],
  exports: [DoctorProfitabilityEngineService],
})
export class DoctorAnalyticsModule {}
