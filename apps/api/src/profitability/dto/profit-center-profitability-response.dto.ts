import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
}

export class ProfitCenterProfitabilityResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty({ type: [ProfitCenterProfitabilityRowDto] })
  data!: ProfitCenterProfitabilityRowDto[];
}
