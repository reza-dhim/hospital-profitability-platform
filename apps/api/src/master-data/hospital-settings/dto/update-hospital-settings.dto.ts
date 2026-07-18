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

  @ApiPropertyOptional({ example: 25, description: "Max upload file size in MB (docs/06_UPLOAD_ENGINE.md §3)." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxUploadFileSizeMb?: number;

  @ApiPropertyOptional({
    example: 3,
    description: "W_OUTLIER_NOMINAL stddev multiplier (docs/07_VALIDATION_ENGINE.md §3).",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  outlierStddevMultiplier?: number;
}
