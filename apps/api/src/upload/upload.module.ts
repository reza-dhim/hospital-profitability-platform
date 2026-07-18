import { Module } from "@nestjs/common";
import { PeriodModule } from "../period/period.module";
import { UploadController } from "./upload.controller";
import { TemplateController } from "./template.controller";
import { UploadService } from "./upload.service";
import { TemplateService } from "./template.service";
import { ParseService } from "./parse.service";
import { ValidateService } from "./validate.service";
import { ConfirmService } from "./confirm.service";
import { UploadPipelineProcessor } from "./upload-pipeline.processor";
import { VIRUS_SCANNER, StubVirusScanner } from "./virus-scanner";

/**
 * Upload pipeline (docs/06_UPLOAD_ENGINE.md). `PeriodModule` imported
 * explicitly for `PeriodService` (not `@Global()`, unlike `StorageModule`/
 * `QueueModule`) — `UploadService.create()` needs it to enforce "uploads
 * only allowed while the target period is open" (docs/25_PERIOD_CLOSING.md §1).
 * `UploadPipelineProcessor` is the single BullMQ worker for the whole
 * pipeline (see its own doc comment) — later sub-tasks extend its dispatch
 * switch, they don't add another `@Processor` on the same queue.
 */
@Module({
  imports: [PeriodModule],
  controllers: [UploadController, TemplateController],
  providers: [
    UploadService,
    TemplateService,
    ParseService,
    ValidateService,
    ConfirmService,
    UploadPipelineProcessor,
    { provide: VIRUS_SCANNER, useClass: StubVirusScanner },
  ],
})
export class UploadModule {}
