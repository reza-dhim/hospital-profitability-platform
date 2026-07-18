import { plainToInstance } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min, validateSync } from "class-validator";

class EnvironmentVariables {
  @IsIn(["development", "test", "production"])
  NODE_ENV!: string;

  @IsInt()
  @Min(1)
  PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_ACCESS_PRIVATE_KEY!: string;

  @IsString()
  JWT_ACCESS_PUBLIC_KEY!: string;

  /**
   * Left unset for real AWS S3 (which resolves its own regional endpoint);
   * set for any S3-compatible service reached via a fixed URL, i.e. local/CI
   * MinIO (docs/06_UPLOAD_ENGINE.md §4). `StorageService` uses
   * path-style addressing whenever this is set, which MinIO requires.
   */
  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsString()
  S3_ACCESS_KEY_ID!: string;

  @IsString()
  S3_SECRET_ACCESS_KEY!: string;

  @IsString()
  S3_BUCKET!: string;
}

/**
 * Fails fast on boot if a required env var is missing/malformed, rather than
 * surfacing as a confusing runtime error later. docs/29_DEPLOYMENT.md §6.
 */
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }

  return validated;
}
