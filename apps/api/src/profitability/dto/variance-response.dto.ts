import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** docs/09_PROFITABILITY_ENGINE.md §5: current period's figure vs. the trailing period's equivalent. */
export class VarianceDto {
  @ApiProperty() absolute!: string;
  @ApiPropertyOptional({ description: "Null when the prior period's value is zero." })
  percentage!: string | null;
}
