import { ApiPropertyOptional } from "@nestjs/swagger";
import { AllocationMethod } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MaxLength } from "class-validator";

/** docs/24_CONFIGURATION.md §1 — only the Sprint-3-modeled settings are editable here. */
export class UpdateHospitalSettingsDto {
  @ApiPropertyOptional({ enum: AllocationMethod })
  @IsOptional()
  @IsEnum(AllocationMethod)
  allocationMethod?: AllocationMethod;

  @ApiPropertyOptional({ example: 15, description: "Default target margin, as a percentage (0-100)." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultTargetMargin?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional({ example: "id-ID" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;
}
