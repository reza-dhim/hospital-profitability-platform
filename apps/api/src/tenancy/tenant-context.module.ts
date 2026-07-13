import { Global, Module } from "@nestjs/common";
import { TenantContextService } from "./tenant-context.service";

/**
 * `TenantContextService` split out of `TenancyModule` into its own
 * dependency-free `@Global()` module (same rationale as `AuditModule` for
 * `AuditContextService`): `PrismaModule`'s factory provider needs
 * `TenantContextService` to wire the RLS extension
 * (`prisma/tenant-rls.extension.ts`), and `TenancyModule` needs
 * `PrismaService` (via `TenantResolver`) — importing `TenancyModule`
 * directly from `PrismaModule` would be a circular module dependency. A
 * standalone leaf module both can depend on avoids that.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantContextModule {}
