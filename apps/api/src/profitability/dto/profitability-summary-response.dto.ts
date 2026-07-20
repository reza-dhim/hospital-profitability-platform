import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProfitabilitySummaryResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty() profitCenterCount!: number;
  @ApiProperty() totalRevenue!: string;
  @ApiProperty() totalCost!: string;
  @ApiProperty() totalGrossProfit!: string;
  @ApiPropertyOptional({ description: "Null when total revenue is zero." })
  overallMargin!: string | null;
}
