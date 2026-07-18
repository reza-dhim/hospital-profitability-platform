import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { JobsOptions, Queue } from "bullmq";
import { UPLOAD_QUEUE_NAME } from "./queue.constants";

/**
 * Thin wrapper over the BullMQ `Queue` so the rest of the app enqueues jobs
 * through a small, mockable interface instead of importing BullMQ types
 * directly everywhere. `upload_batches.status` in Postgres stays the source
 * of truth the API polls — not raw BullMQ job state — so this service's only
 * job is "get the job onto the queue", nothing about job progress leaks
 * past it. `opts` (retries/backoff) is optional and unused by callers before
 * Sprint 4 sub-task 4 — that sub-task's parse job is the first to pass
 * `{ attempts, backoff }`, per docs/17_ERROR_HANDLING.md §4's "transient
 * upstream failures... retried with exponential backoff (max 3 attempts)"
 * (storage is exactly this kind of upstream dependency).
 */
@Injectable()
export class UploadQueueService {
  constructor(@InjectQueue(UPLOAD_QUEUE_NAME) private readonly queue: Queue) {}

  async enqueue<T extends object>(jobName: string, data: T, opts?: JobsOptions): Promise<void> {
    await this.queue.add(jobName, data, opts);
  }
}
