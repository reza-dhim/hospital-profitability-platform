import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TenantContextService } from "./tenant-context.service";
import { TenantMiddleware } from "./tenant.middleware";
import { TenantResolver } from "./tenant.resolver";
import { TenantGuard } from "./tenant.guard";
import { OrganizationService } from "./organization.service";
import { OrganizationController } from "./organization.controller";
import { HospitalService } from "./hospital.service";
import { HospitalController } from "./hospital.controller";
import { BranchService } from "./branch.service";
import { BranchController } from "./branch.controller";

/**
 * Registers `TenantGuard` here (after `AuthModule`'s guard stack, per
 * `AppModule`'s import order — `APP_GUARD` providers run in registration
 * order across the whole app) so tenant resolution happens once the caller's
 * identity is already known. `TenantMiddleware` is applied globally via
 * `configure()` since Nest middleware isn't itself an `APP_*` provider.
 */
@Module({
  controllers: [OrganizationController, HospitalController, BranchController],
  providers: [
    TenantContextService,
    TenantMiddleware,
    TenantResolver,
    OrganizationService,
    HospitalService,
    BranchService,
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [TenantContextService, TenantResolver],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
