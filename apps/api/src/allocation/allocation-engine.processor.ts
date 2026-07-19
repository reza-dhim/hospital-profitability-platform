import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { ALLOCATION_QUEUE_NAME } from "../queue/queue.constants";
import { AllocationEngineService, AllocationRunJobData } from "./allocation-engine.service";

/** One `@Processor` per queue, dispatching by `job.name` — same rationale as `UploadPipelineProcessor`. */
@Processor(ALLOCATION_QUEUE_NAME)
export class AllocationEngineProcessor extends WorkerHost {
  private readonly logger = new Logger(AllocationEngineProcessor.name);

  constructor(private readonly allocationEngineService: AllocationEngineService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case "allocation.run":
        await this.allocationEngineService.processRun(job.data as AllocationRunJobData);
        return;
      default:
        this.logger.warn(`No handler registered for job name '${job.name}' on queue '${ALLOCATION_QUEUE_NAME}'.`);
    }
  }
}
