import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID } from "class-validator";

/**
 * docs/09_PROFITABILITY_ENGINE.md §6: reads scope to the latest completed,
 * non-stale run for `periodId` unless `allocationRunId` is explicitly
 * supplied (historical/audit comparison — read as-is regardless of status/staleness).
 */
export class ProfitabilityQueryDto {
  @ApiProperty()
  @IsUUID()
  periodId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  allocationRunId?: string;
}

export class ListProfitCentersQueryDto extends ProfitabilityQueryDto {
  @ApiPropertyOptional({ enum: ["margin", "grossProfit"], default: "margin" })
  @IsOptional()
  @IsIn(["margin", "grossProfit"])
  sortBy?: "margin" | "grossProfit";

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc";
}

export class TrendsQueryDto {
  @ApiProperty()
  @IsUUID()
  profitCenterId!: string;
}
