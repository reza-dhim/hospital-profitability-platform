import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VarianceDto } from "./variance-response.dto";

export class ProfitabilitySummaryResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty() profitCenterCount!: number;
  @ApiProperty() totalRevenue!: string;
  @ApiProperty() totalCost!: string;
  @ApiProperty() totalGrossProfit!: string;
  @ApiPropertyOptional({ description: "Null when total revenue is zero." })
  overallMargin!: string | null;
  @ApiPropertyOptional({ type: VarianceDto, description: "vs. the trailing period's latest completed run. Null when no trailing-period comparison exists." })
  totalRevenueVariance!: VarianceDto | null;
  @ApiPropertyOptional({ type: VarianceDto })
  totalCostVariance!: VarianceDto | null;
  @ApiPropertyOptional({ type: VarianceDto })
  totalGrossProfitVariance!: VarianceDto | null;
  @ApiPropertyOptional({ type: VarianceDto, description: "Null when either period's overall margin is undefined (zero revenue)." })
  overallMarginVariance!: VarianceDto | null;
}
