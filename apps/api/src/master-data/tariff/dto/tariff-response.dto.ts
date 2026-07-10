import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TariffStatus } from "@prisma/client";

export class TariffResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty({ type: "string" }) currentTariff!: unknown;
  @ApiPropertyOptional({ type: "string" }) recommendedTariff?: unknown;
  @ApiProperty() effectiveDate!: Date;
  @ApiPropertyOptional() approvedByUserId?: string | null;
  @ApiPropertyOptional() approvedAt?: Date | null;
  @ApiProperty({ enum: TariffStatus }) status!: TariffStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
