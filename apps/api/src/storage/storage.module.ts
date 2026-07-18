import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";

/** `@Global()` — same rationale as `PrismaModule`/`AuditModule`: every upload-pipeline sub-task needs `StorageService`. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
