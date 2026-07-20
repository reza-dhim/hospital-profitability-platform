import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProfitabilityTrendPointDto {
  @ApiProperty() periodId!: string;
  @ApiProperty() periodLabel!: string;
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() revenue!: string;
  @ApiProperty() grossProfit!: string;
  @ApiPropertyOptional() margin!: string | null;
}

export class ProfitabilityTrendResponseDto {
  @ApiProperty() profitCenterId!: string;
  @ApiProperty({
    type: [ProfitabilityTrendPointDto],
    description: "One point per period that has a completed, non-stale run — periods with none are omitted (a gap, not zero-filled).",
  })
  data!: ProfitabilityTrendPointDto[];
}
