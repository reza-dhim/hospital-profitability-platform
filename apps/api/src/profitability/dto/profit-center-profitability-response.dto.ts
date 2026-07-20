import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VarianceDto } from "./variance-response.dto";

export class ProfitCenterProfitabilityRowDto {
  @ApiProperty() profitCenterId!: string;
  @ApiProperty() profitCenterCode!: string;
  @ApiProperty() profitCenterName!: string;
  @ApiProperty() revenue!: string;
  @ApiProperty() directCost!: string;
  @ApiProperty() allocatedCost!: string;
  @ApiProperty() totalCost!: string;
  @ApiProperty() grossProfit!: string;
  @ApiPropertyOptional({ description: "Null when revenue is zero." })
  margin!: string | null;
  @ApiPropertyOptional({
    type: VarianceDto,
    description: "total_cost vs. the trailing period's latest completed run (docs/09_PROFITABILITY_ENGINE.md §5). Null when no trailing-period comparison exists.",
  })
  totalCostVariance!: VarianceDto | null;
}

export class ProfitCenterProfitabilityResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty({ type: [ProfitCenterProfitabilityRowDto] })
  data!: ProfitCenterProfitabilityRowDto[];
}
