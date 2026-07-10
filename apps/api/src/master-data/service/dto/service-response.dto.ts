import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ServiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() profitCenterId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() serviceType!: string;
  @ApiPropertyOptional() standardDuration?: number | null;
  @ApiPropertyOptional({ type: "string", description: "Denormalized from the active Tariff row." })
  currentTariff?: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
