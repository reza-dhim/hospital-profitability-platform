import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsISO8601, IsNumber, IsOptional, Min } from "class-validator";

/**
 * Deliberately not `PartialType(CreateTariffDto)`: `currentTariff`/`serviceId`
 * are immutable after creation (docs/02_DOMAIN_MODEL.md `tariffs` note —
 * append-only history; a tariff *change* is a new `POST`, not a `PATCH` of an
 * existing row). Only the non-financial-value fields are editable here.
 */
export class UpdateTariffDto {
  @ApiPropertyOptional({ example: 175000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedTariff?: number;

  @ApiPropertyOptional({ example: "2026-08-01" })
  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;
}
