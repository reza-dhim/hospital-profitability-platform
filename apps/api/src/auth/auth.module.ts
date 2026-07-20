import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { PermissionsService } from "./permissions.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

/**
 * Registers the global guard stack here (docs/04_RBAC.md §6) rather than in
 * AppModule — feature-first: the module that owns auth also wires it in.
 * Order matters: JwtAuthGuard must populate `request.user` before
 * RolesGuard can read it.
 *
 * `PermissionsGuard` is deliberately NOT registered here even though it
 * lives in `./guards/` — unlike `RolesGuard` (checks the JWT's `role` claim
 * directly, no DB access), it queries `roles`/`role_permissions`, which are
 * RLS-scoped to `app.current_hospital_id`. That session variable is only
 * set by `TenantGuard` (`tenancy.module.ts`), which — per `AppModule`'s
 * import order — runs *after* this module's guards. Registering
 * `PermissionsGuard` here would run it before tenant context exists, so
 * every RLS-scoped read it makes returns nothing and every
 * `@RequirePermissions()` check fails, regardless of the caller's actual
 * permissions. It's registered in `TenancyModule` instead, after
 * `TenantGuard`, for that reason — see `PermissionsService` export below.
 */
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    PermissionsService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PermissionsService],
})
export class AuthModule {}
