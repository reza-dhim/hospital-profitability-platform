import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { UploadQueueService } from "./upload-queue.service";
import { UPLOAD_QUEUE_NAME } from "./queue.constants";

/**
 * Proves a job enqueued through `UploadQueueService` is actually picked up
 * and processed by a real BullMQ worker against real Redis — the
 * infrastructure proof for docs/06_UPLOAD_ENGINE.md §2's "parsing and
 * validation are asynchronous (BullMQ + Redis)". The parse/validate
 * processors themselves are added by the sub-tasks that own each pipeline
 * stage; this only proves the queue plumbing.
 */
describe("Upload queue (BullMQ + real Redis)", () => {
  jest.setTimeout(120_000);

  let container: StartedRedisContainer;
  let connections: IORedis[];
  let queue: Queue;
  let worker: Worker | undefined;
  let uploadQueueService: UploadQueueService;

  // Every `connect()` call opens its own ioredis TCP connection, separate
  // from whatever BullMQ manages internally — `Worker.close()`/`Queue.close()`
  // only close a connection BullMQ itself created, not one handed in
  // externally (docs comment in queue.module.ts: passing a live `IORedis`
  // instance is the correct way to give BullMQ a URL-based connection, but
  // that also makes the caller responsible for its lifecycle). Forgetting
  // to `quit()` every one of these left a previous run of this suite
  // hanging (Jest's "did not exit one second after the test run" symptom)
  // — tracked here and drained in `afterAll` specifically to avoid a repeat.
  function connect(): IORedis {
    const connection = new IORedis(container.getConnectionUrl(), { maxRetriesPerRequest: null });
    connections.push(connection);
    return connection;
  }

  beforeAll(async () => {
    container = await new RedisContainer("redis:7-alpine").start();
    connections = [];
    queue = new Queue(UPLOAD_QUEUE_NAME, { connection: connect() });
    uploadQueueService = new UploadQueueService(queue);
  }, 120_000);

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
  });

  afterAll(async () => {
    await queue.close();
    await Promise.all(connections.map((connection) => connection.quit()));
    await container.stop();
  });

  it("enqueues a job that a real worker picks up and processes", async () => {
    const processed: unknown[] = [];
    worker = new Worker(
      UPLOAD_QUEUE_NAME,
      async (job) => {
        processed.push({ name: job.name, data: job.data });
        return { ok: true };
      },
      { connection: connect() }
    );

    await uploadQueueService.enqueue("upload.parse", { uploadBatchId: "batch-1" });

    await waitFor(() => processed.length > 0);
    expect(processed[0]).toEqual({ name: "upload.parse", data: { uploadBatchId: "batch-1" } });
  });

  it("keeps a failed job's failure isolated — it does not stop the queue from processing the next job", async () => {
    const processed: string[] = [];
    worker = new Worker(
      UPLOAD_QUEUE_NAME,
      async (job) => {
        if (job.name === "will-fail") throw new Error("simulated processing failure");
        processed.push(job.name);
      },
      { connection: connect() }
    );

    await uploadQueueService.enqueue("will-fail", {});
    await uploadQueueService.enqueue("will-succeed", {});

    await waitFor(() => processed.includes("will-succeed"));
    expect(processed).toEqual(["will-succeed"]);
  });
});

function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for condition"));
      }
    }, 50);
  });
}
