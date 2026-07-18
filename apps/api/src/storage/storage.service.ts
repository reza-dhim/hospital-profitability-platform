import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** "Short-lived signed URLs only — never public" (docs/06_UPLOAD_ENGINE.md §4). */
const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * S3-compatible object storage for uploaded files (docs/06_UPLOAD_ENGINE.md
 * §4). Built on `@aws-sdk/client-s3` (not the `minio` SDK) so swapping
 * `S3_ENDPOINT` from local MinIO to real AWS S3 in production is a config
 * change, not a code change. `@Global()` (see `storage.module.ts`) — every
 * upload-pipeline sub-task from here on needs it.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>("S3_ENDPOINT");
    this.bucket = this.config.getOrThrow<string>("S3_BUCKET");
    this.client = new S3Client({
      region: this.config.get<string>("S3_REGION") ?? "us-east-1",
      endpoint,
      // MinIO requires path-style addressing (bucket as a path segment, not
      // a subdomain); real AWS S3 doesn't set S3_ENDPOINT, so this stays off.
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>("S3_ACCESS_KEY_ID"),
        secretAccessKey: this.config.getOrThrow<string>("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  /** Idempotent: creates `S3_BUCKET` on boot if it doesn't already exist. No init container needed. */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      const name = error instanceof Error ? error.name : undefined;
      if (name !== "NotFound" && name !== "NoSuchBucket") {
        throw error;
      }
    }
    await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    this.logger.log(`Created S3 bucket "${this.bucket}".`);
  }

  /** Tenant-prefixed key per docs/06_UPLOAD_ENGINE.md §4: `{org_id}/{hospital_id}/uploads/{upload_batch_id}.xlsx`. */
  buildUploadKey(organizationId: string, hospitalId: string, uploadBatchId: string): string {
    return `${organizationId}/${hospitalId}/uploads/${uploadBatchId}.xlsx`;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  /** Used by the async parse job (Sprint 4 sub-task 4) to fetch an uploaded file's bytes back out for parsing. */
  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await response.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  /** Never returns a public URL — always short-lived and signed (docs/06_UPLOAD_ENGINE.md §4). */
  getSignedDownloadUrl(key: string, expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
