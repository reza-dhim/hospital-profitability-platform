import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageService } from "./storage.service";
import type { ConfigService } from "@nestjs/config";

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/object?sig=abc"),
}));

const send = jest.fn();

jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send })),
  };
});

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    S3_ENDPOINT: "http://localhost:9002",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_BUCKET: "hpp-uploads-test",
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

function notFoundError(): Error {
  const error = new Error("Not Found");
  error.name = "NotFound";
  return error;
}

describe("StorageService", () => {
  beforeEach(() => {
    send.mockReset();
    (getSignedUrl as jest.Mock).mockClear();
  });

  it("buildUploadKey produces the tenant-prefixed key per docs/06_UPLOAD_ENGINE.md §4", () => {
    const service = new StorageService(makeConfig());
    expect(service.buildUploadKey("org-1", "hospital-1", "batch-1")).toBe("org-1/hospital-1/uploads/batch-1.xlsx");
  });

  describe("onModuleInit", () => {
    it("does nothing when the bucket already exists", async () => {
      send.mockResolvedValueOnce({});
      const service = new StorageService(makeConfig());
      await service.onModuleInit();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
    });

    it("creates the bucket when HeadBucket reports it doesn't exist", async () => {
      send.mockRejectedValueOnce(notFoundError());
      send.mockResolvedValueOnce({});
      const service = new StorageService(makeConfig());
      await service.onModuleInit();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
    });

    it("rethrows and does not attempt to create the bucket on a non-NotFound error (e.g. bad credentials)", async () => {
      const authError = new Error("Access Denied");
      authError.name = "AccessDenied";
      send.mockRejectedValueOnce(authError);
      const service = new StorageService(makeConfig());

      await expect(service.onModuleInit()).rejects.toThrow("Access Denied");
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("putObject", () => {
    it("sends a PutObjectCommand with the bucket, key, body, and content type", async () => {
      send.mockResolvedValueOnce({});
      const service = new StorageService(makeConfig());
      const body = Buffer.from("file contents");

      await service.putObject("org-1/hospital-1/uploads/batch-1.xlsx", body, "application/vnd.ms-excel");

      expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
      expect(send.mock.calls[0][0].input).toEqual({
        Bucket: "hpp-uploads-test",
        Key: "org-1/hospital-1/uploads/batch-1.xlsx",
        Body: body,
        ContentType: "application/vnd.ms-excel",
      });
    });
  });

  describe("getObject", () => {
    it("downloads and buffers the object's bytes", async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      send.mockResolvedValueOnce({ Body: { transformToByteArray: () => Promise.resolve(bytes) } });
      const service = new StorageService(makeConfig());

      const result = await service.getObject("org-1/hospital-1/uploads/batch-1.xlsx");

      expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
      expect(send.mock.calls[0][0].input).toEqual({
        Bucket: "hpp-uploads-test",
        Key: "org-1/hospital-1/uploads/batch-1.xlsx",
      });
      expect(result).toEqual(Buffer.from(bytes));
    });
  });

  describe("getSignedDownloadUrl", () => {
    it("builds a GetObjectCommand and delegates signing, defaulting to a 15-minute TTL", async () => {
      const service = new StorageService(makeConfig());
      const url = await service.getSignedDownloadUrl("org-1/hospital-1/uploads/batch-1.xlsx");

      expect(url).toBe("https://signed.example/object?sig=abc");
      const [, command, options] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({ Bucket: "hpp-uploads-test", Key: "org-1/hospital-1/uploads/batch-1.xlsx" });
      expect(options).toEqual({ expiresIn: 15 * 60 });
    });

    it("honors an explicit TTL override", async () => {
      const service = new StorageService(makeConfig());
      await service.getSignedDownloadUrl("some-key", 60);

      const [, , options] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(options).toEqual({ expiresIn: 60 });
    });
  });

  it("enables forcePathStyle only when S3_ENDPOINT is set (MinIO needs it; real AWS S3 doesn't)", async () => {
    const { S3Client } = jest.requireMock("@aws-sdk/client-s3") as { S3Client: jest.Mock };
    S3Client.mockClear();

    new StorageService(makeConfig({ S3_ENDPOINT: "http://localhost:9002" }));
    expect(S3Client.mock.calls[0][0]).toMatchObject({ forcePathStyle: true });

    new StorageService(makeConfig({ S3_ENDPOINT: "" }));
    expect(S3Client.mock.calls[1][0]).toMatchObject({ forcePathStyle: false });
  });
});
