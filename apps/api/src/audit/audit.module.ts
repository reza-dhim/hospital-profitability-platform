import { Global, Module } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { AuditContextService } from "./audit-context.service";

/**
 * `@Global()` so every feature module's services (the generic master-data
 * CRUD engine in particular, `common/crud`) can inject `AuditContextService`
 * without each declaring an explicit import — same rationale as
 * `PrismaModule` being global.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditContextService],
  exports: [AuditContextService],
})
export class AuditModule {}
