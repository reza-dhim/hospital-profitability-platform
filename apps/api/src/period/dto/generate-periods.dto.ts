import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

/** Generates 12 consecutive monthly `draft` periods for this fiscal year (docs/25_PERIOD_CLOSING.md §3). */
export class GeneratePeriodsDto {
  @ApiProperty({
    example: 2026,
    description:
      "Calendar year the fiscal year starts in (e.g. with fiscal_year_start_month=4, fiscalYear=2026 generates Apr 2026 through Mar 2027).",
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  fiscalYear!: number;
}
