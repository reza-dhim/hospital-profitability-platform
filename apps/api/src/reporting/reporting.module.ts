import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { DoctorAnalyticsModule } from "../doctor-analytics/doctor-analytics.module";
import { ReportingController } from "./reporting.controller";
import { ReportDataService } from "./report-data.service";
import { ReportRendererService } from "./report-renderer.service";
import { ReportExportService } from "./report-export.service";

@Module({
  imports: [AuthModule, ProfitabilityModule, DoctorAnalyticsModule],
  controllers: [ReportingController],
  providers: [ReportDataService, ReportRendererService, ReportExportService],
})
export class ReportingModule {}
