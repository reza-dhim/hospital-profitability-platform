import { Module } from "@nestjs/common";
import { DoctorAnalyticsController } from "./doctor-analytics.controller";

@Module({
  controllers: [DoctorAnalyticsController],
})
export class DoctorAnalyticsModule {}
