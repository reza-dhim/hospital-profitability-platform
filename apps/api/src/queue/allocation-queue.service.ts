import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { JobsOptions, Queue } from "bullmq";
import { ALLOCATION_QUEUE_NAME } from "./queue.constants";

/** Thin BullMQ wrapper for the allocation-engine queue — same shape/rationale as `UploadQueueService`. */
@Injectable()
export class AllocationQueueService {
  constructor(@InjectQueue(ALLOCATION_QUEUE_NAME) private readonly queue: Queue) {}

  async enqueue<T extends object>(jobName: string, data: T, opts?: JobsOptions): Promise<void> {
    await this.queue.add(jobName, data, opts);
  }
}
