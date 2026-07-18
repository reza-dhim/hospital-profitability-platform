import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UPLOAD_QUEUE_NAME } from "../queue/queue.constants";
import { ParseService, UploadParseJobData } from "./parse.service";
import { ValidateService, UploadValidateJobData } from "./validate.service";

/**
 * One `@Processor` per queue, dispatching by `job.name` internally — NOT one
 * `@Processor(UPLOAD_QUEUE_NAME)` class per pipeline stage. BullMQ workers on
 * the same queue compete for every job regardless of name; a second worker
 * class on this queue would race with this one, and whichever picked up a
 * job first would need to already know to skip job names it doesn't own —
 * silently swallowing jobs meant for the other worker. Every pipeline stage
 * adds a case here instead.
 */
@Processor(UPLOAD_QUEUE_NAME)
export class UploadPipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(UploadPipelineProcessor.name);

  constructor(
    private readonly parseService: ParseService,
    private readonly validateService: ValidateService
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case "upload.parse":
        await this.parseService.processUpload(job.data as UploadParseJobData);
        return;
      case "upload.validate":
        await this.validateService.processValidate(job.data as UploadValidateJobData);
        return;
      default:
        this.logger.warn(`No handler registered for job name '${job.name}' on queue '${UPLOAD_QUEUE_NAME}'.`);
    }
  }
}
