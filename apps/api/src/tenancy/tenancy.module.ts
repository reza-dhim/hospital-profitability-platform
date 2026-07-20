import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
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
 *
 * `PermissionsGuard` is also registered here, deliberately after
 * `TenantGuard` in this same `providers` array — see `AuthModule`'s doc
 * comment on why it can't live there: it needs `app.current_hospital_id`
 * (set by `TenantGuard`) for its RLS-scoped `roles`/`role_permissions`
 * reads to see anything. `AuthModule` is imported here (and exports
 * `PermissionsService`) purely to make that guard's own dependency
 * resolvable — no other coupling between the two modules.
 *
 * `TenantContextService` itself lives in the standalone `TenantContextModule`
 * (`@Global()`, imported by `AppModule`), not here — see that module's
 * doc comment for why.
 */
@Module({
  imports: [AuthModule],
  controllers: [OrganizationController, HospitalController, BranchController],
  providers: [
    TenantMiddleware,
    TenantResolver,
    OrganizationService,
    HospitalService,
    BranchService,
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TenantResolver],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
