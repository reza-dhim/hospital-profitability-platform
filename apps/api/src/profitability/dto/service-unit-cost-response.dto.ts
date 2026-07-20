import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
}

export class ServiceUnitCostResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty({ type: [ServiceUnitCostRowDto] })
  data!: ServiceUnitCostRowDto[];
}
