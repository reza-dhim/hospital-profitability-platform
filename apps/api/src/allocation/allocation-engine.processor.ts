import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { ALLOCATION_QUEUE_NAME } from "../queue/queue.constants";
import { ProfitabilityEngineService, ProfitabilityComputeJobData } from "../profitability/profitability-engine.service";
import { AllocationEngineService, AllocationRunJobData } from "./allocation-engine.service";

/**
 * One `@Processor` per queue, dispatching by `job.name` — same rationale as
 * `UploadPipelineProcessor`. `profitability.compute` is the pipeline's
 * second stage (docs/09_PROFITABILITY_ENGINE.md §3), enqueued by
 * `AllocationEngineService` itself right after a run reaches `completed` —
 * same "one queue, multiple chained job names" shape as `upload.parse` ->
 * `upload.validate`.
 */
@Processor(ALLOCATION_QUEUE_NAME)
export class AllocationEngineProcessor extends WorkerHost {
  private readonly logger = new Logger(AllocationEngineProcessor.name);

  constructor(
    private readonly allocationEngineService: AllocationEngineService,
    private readonly profitabilityEngineService: ProfitabilityEngineService
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case "allocation.run":
        await this.allocationEngineService.processRun(job.data as AllocationRunJobData);
        return;
      case "profitability.compute":
        await this.profitabilityEngineService.processRun(job.data as ProfitabilityComputeJobData);
        return;
      default:
        this.logger.warn(`No handler registered for job name '${job.name}' on queue '${ALLOCATION_QUEUE_NAME}'.`);
    }
  }
}
