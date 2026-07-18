import { UploadQueueService } from "./upload-queue.service";
import type { Queue } from "bullmq";

function makeQueue() {
  return { add: jest.fn().mockResolvedValue({ id: "job-1" }) } as unknown as Queue;
}

describe("UploadQueueService", () => {
  it("enqueues a job with the given name and payload", async () => {
    const queue = makeQueue();
    const service = new UploadQueueService(queue);

    await service.enqueue("upload.parse", { uploadBatchId: "batch-1" });

    expect(queue.add).toHaveBeenCalledWith("upload.parse", { uploadBatchId: "batch-1" }, undefined);
  });

  it("passes job options (retries/backoff) through when given", async () => {
    const queue = makeQueue();
    const service = new UploadQueueService(queue);
    const opts = { attempts: 3, backoff: { type: "exponential" as const, delay: 1000 } };

    await service.enqueue("upload.parse", { uploadBatchId: "batch-1" }, opts);

    expect(queue.add).toHaveBeenCalledWith("upload.parse", { uploadBatchId: "batch-1" }, opts);
  });

  it("resolves to void, not the underlying BullMQ job (keeps queue internals from leaking past this service)", async () => {
    const queue = makeQueue();
    const service = new UploadQueueService(queue);

    await expect(service.enqueue("upload.validate", { uploadBatchId: "batch-1" })).resolves.toBeUndefined();
  });
});
