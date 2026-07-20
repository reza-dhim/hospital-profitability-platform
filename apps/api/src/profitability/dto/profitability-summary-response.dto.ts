import { ApiProperty } from "@nestjs/swagger";
import { VarianceDto } from "./variance-response.dto";

export class ProfitabilitySummaryResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty() profitCenterCount!: number;
  @ApiProperty() totalRevenue!: string;
  @ApiProperty() totalCost!: string;
  @ApiProperty() totalGrossProfit!: string;
  @ApiProperty({ type: String, nullable: true, description: "Null when total revenue is zero." })
  overallMargin!: string | null;
  @ApiProperty({
    type: VarianceDto,
    nullable: true,
    description: "vs. the trailing period's latest completed run. Null when no trailing-period comparison exists.",
  })
  totalRevenueVariance!: VarianceDto | null;
  @ApiProperty({ type: VarianceDto, nullable: true })
  totalCostVariance!: VarianceDto | null;
  @ApiProperty({ type: VarianceDto, nullable: true })
  totalGrossProfitVariance!: VarianceDto | null;
  @ApiProperty({ type: VarianceDto, nullable: true, description: "Null when either period's overall margin is undefined (zero revenue)." })
  overallMarginVariance!: VarianceDto | null;
}
