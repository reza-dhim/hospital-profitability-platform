import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import IORedis from "ioredis";
import { UPLOAD_QUEUE_NAME } from "./queue.constants";
import { UploadQueueService } from "./upload-queue.service";

/** `@Global()` — same rationale as `StorageModule`: every upload-pipeline sub-task from here needs `UploadQueueService`. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // BullMQ's `ConnectionOptions` type has no `url` field (only
      // host/port/... or a live client instance) even though ioredis'
      // constructor itself accepts a URL string — passing a real `IORedis`
      // instance is the correct way to hand it a `REDIS_URL` connection
      // string. `maxRetriesPerRequest: null` is BullMQ's documented
      // requirement for any externally-supplied ioredis connection.
      useFactory: (config: ConfigService) => ({
        connection: new IORedis(config.getOrThrow<string>("REDIS_URL"), { maxRetriesPerRequest: null }),
      }),
    }),
    BullModule.registerQueue({ name: UPLOAD_QUEUE_NAME }),
  ],
  providers: [UploadQueueService],
  exports: [UploadQueueService],
})
export class QueueModule {}
