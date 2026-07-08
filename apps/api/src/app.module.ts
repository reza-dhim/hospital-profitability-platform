import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AppConfigModule } from "./config/app-config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { AuthModule } from "./auth/auth.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { RbacModule } from "./rbac/rbac.module";
import { MasterDataModule } from "./master-data/master-data.module";
import { UploadModule } from "./upload/upload.module";
import { AllocationModule } from "./allocation/allocation.module";
import { ProfitabilityModule } from "./profitability/profitability.module";
import { DoctorAnalyticsModule } from "./doctor-analytics/doctor-analytics.module";
import { AiModule } from "./ai/ai.module";
import { ReportingModule } from "./reporting/reporting.module";
import { AuditModule } from "./audit/audit.module";

/**
 * Bounded-context modules mirror docs/ARCHITECT_AUDIT.md's Engineering
 * Recommendation (modular monolith). Each is registered here so the module
 * graph is real from Sprint 1 onward, even though most expose only a
 * NotImplemented placeholder until their own sprint (docs/00_DOCUMENTATION_INDEX.md).
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    TenancyModule,
    RbacModule,
    MasterDataModule,
    UploadModule,
    AllocationModule,
    ProfitabilityModule,
    DoctorAnalyticsModule,
    AiModule,
    ReportingModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
