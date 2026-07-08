import { plainToInstance } from "class-transformer";
import { IsIn, IsInt, IsString, Min, validateSync } from "class-validator";

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
