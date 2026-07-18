import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import type { ConfigService } from "@nestjs/config";
import { StorageService } from "./storage.service";

/**
 * Proves `StorageService` actually works against a real S3-compatible
 * backend, not just that it calls the SDK with the right shape (that's
 * `storage.service.spec.ts`). Uses a real MinIO container (generic
 * `testcontainers`, not `@testcontainers/postgresql`) since MinIO has no
 * dedicated Testcontainers module — same "prove it against the real backing
 * service" standard as `prisma/tenant-isolation.integration-spec.ts`.
 */
describe("StorageService (real MinIO)", () => {
  jest.setTimeout(120_000);

  let container: StartedTestContainer;
  let storageService: StorageService;
  const bucket = "hpp-uploads-test";

  beforeAll(async () => {
    container = await new GenericContainer("minio/minio:latest")
      .withExposedPorts(9000)
      .withCommand(["server", "/data"])
      .withEnvironment({ MINIO_ROOT_USER: "hpp_minio_test", MINIO_ROOT_PASSWORD: "hpp_minio_test_secret" })
      .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000).forStatusCode(200))
      .start();

    const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
    const config = {
      get: (key: string) => (key === "S3_ENDPOINT" ? endpoint : key === "S3_REGION" ? "us-east-1" : undefined),
      getOrThrow: (key: string) => {
        const values: Record<string, string> = {
          S3_ACCESS_KEY_ID: "hpp_minio_test",
          S3_SECRET_ACCESS_KEY: "hpp_minio_test_secret",
          S3_BUCKET: bucket,
        };
        const value = values[key];
        if (value === undefined) throw new Error(`Missing config: ${key}`);
        return value;
      },
    } as unknown as ConfigService;

    storageService = new StorageService(config);
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("creates the bucket on init if it doesn't exist yet, idempotently", async () => {
    await storageService.onModuleInit();
    await expect(storageService.onModuleInit()).resolves.toBeUndefined();
  });

  it("round-trips a real object through put -> signed URL -> HTTP GET, using the tenant-prefixed key", async () => {
    const key = storageService.buildUploadKey("org-1", "hospital-1", "batch-1");
    expect(key).toBe("org-1/hospital-1/uploads/batch-1.xlsx");

    const contents = Buffer.from("row1,row2,row3");
    await storageService.putObject(key, contents, "application/vnd.ms-excel");

    const url = await storageService.getSignedDownloadUrl(key);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(contents)).toBe(true);
  });

  it("round-trips a real object through put -> getObject directly (no signed URL/HTTP hop)", async () => {
    const key = storageService.buildUploadKey("org-1", "hospital-1", "batch-getobject");
    const contents = Buffer.from("direct download contents");
    await storageService.putObject(key, contents, "application/vnd.ms-excel");

    const downloaded = await storageService.getObject(key);
    expect(downloaded.equals(contents)).toBe(true);
  });

  it("never returns a plain unsigned URL — the object is not reachable without the signature", async () => {
    const key = storageService.buildUploadKey("org-1", "hospital-1", "batch-2");
    await storageService.putObject(key, Buffer.from("secret"), "application/vnd.ms-excel");

    const signedUrl = await storageService.getSignedDownloadUrl(key);
    const unsignedUrl = signedUrl.split("?")[0]!;
    const response = await fetch(unsignedUrl);
    expect(response.status).not.toBe(200);
  });

  it("expires the signed URL after its TTL", async () => {
    const key = storageService.buildUploadKey("org-1", "hospital-1", "batch-3");
    await storageService.putObject(key, Buffer.from("data"), "application/vnd.ms-excel");

    const url = await storageService.getSignedDownloadUrl(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(url);
    expect(response.status).not.toBe(200);
  });
});
