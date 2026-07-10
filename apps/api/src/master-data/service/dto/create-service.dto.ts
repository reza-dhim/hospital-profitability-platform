import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";

/**
 * `currentTariff` is intentionally not settable here — it's a denormalized
 * pointer to the active `Tariff` row (docs/02_DOMAIN_MODEL.md `tariffs`
 * note), kept in sync by `TariffService` whenever a new active tariff is
 * written, not edited directly on the service.
 */
export class CreateServiceDto {
  @ApiProperty({ description: "Profit center this service's revenue is attributed to." })
  @IsString()
  profitCenterId!: string;

  @ApiProperty({ example: "SVC-001" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "Konsultasi Dokter Spesialis" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "consultation", description: "Free-form service type." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  serviceType!: string;

  @ApiPropertyOptional({ example: 30, description: "Standard duration in minutes." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standardDuration?: number;
}
