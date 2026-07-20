import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VarianceDto } from "./variance-response.dto";

export class ServiceUnitCostRowDto {
  @ApiProperty() serviceId!: string;
  @ApiProperty() serviceCode!: string;
  @ApiProperty() serviceName!: string;
  @ApiProperty() profitCenterId!: string;
  @ApiProperty() serviceAllocatedCost!: string;
  @ApiProperty() serviceDirectCost!: string;
  @ApiProperty() serviceVolume!: string;
  @ApiPropertyOptional({ description: "Null when serviceVolume is zero — 'No volume this period'." })
  unitCost!: string | null;
  @ApiPropertyOptional() currentTariff!: string | null;
  @ApiPropertyOptional() tariffGap!: string | null;
  @ApiProperty() targetMarginUsed!: string;
  @ApiPropertyOptional() recommendedTariff!: string | null;
  @ApiPropertyOptional({
    type: VarianceDto,
    description: "unit_cost vs. the trailing period's latest completed run (docs/09_PROFITABILITY_ENGINE.md §5, docs/10_UNIT_COST_ENGINE.md). Null when no trailing-period comparison exists.",
  })
  unitCostVariance!: VarianceDto | null;
}

export class ServiceUnitCostResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty({ type: [ServiceUnitCostRowDto] })
  data!: ServiceUnitCostRowDto[];
}
