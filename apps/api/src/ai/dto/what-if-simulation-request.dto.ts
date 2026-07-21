import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsUUID, Min } from "class-validator";

/**
 * docs/12_AI_ENGINE.md §4 — ephemeral, request-scoped. Absolute values, not
 * percentage deltas (matches every other tariff/volume representation in
 * the API — `CreateTariffDto.currentTariff`, `revenue_entries.volume`). At
 * least one of `hypotheticalTariff`/`hypotheticalVolume` is required —
 * enforced in `WhatIfSimulationService`, not here (a cross-field check,
 * same convention as other business-rule validation in this codebase).
 */
export class WhatIfSimulationRequestDto {
  @ApiProperty()
  @IsUUID()
  periodId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  allocationRunId?: string;

  @ApiProperty({ description: "The service to simulate — tariff is inherently a per-service concept." })
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({ example: 175000, description: "Defaults to the service's real current tariff when omitted." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hypotheticalTariff?: number;

  @ApiPropertyOptional({ example: 120, description: "Defaults to the service's real current volume when omitted." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hypotheticalVolume?: number;
}
