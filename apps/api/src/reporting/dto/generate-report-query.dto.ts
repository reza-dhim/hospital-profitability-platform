import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsUUID } from "class-validator";

/** docs/15_REPORTING.md §2: "not regenerated in place" unless the caller explicitly opts in. */
export class GenerateReportQueryDto {
  @ApiProperty()
  @IsUUID()
  periodId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  allocationRunId?: string;

  @ApiPropertyOptional({
    default: false,
    description: "Force a fresh generation even if an export already exists for this (reportType, period) pair.",
  })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  regenerate?: boolean;
}
