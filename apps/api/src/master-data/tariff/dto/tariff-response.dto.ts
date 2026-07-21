import { ApiProperty } from "@nestjs/swagger";
import { TariffStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class TariffResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty({ type: "string" }) currentTariff!: string;
  @ApiProperty({ type: String, nullable: true }) recommendedTariff!: string | null;
  @ApiProperty() effectiveDate!: Date;
  @ApiProperty({ type: String, nullable: true }) approvedByUserId!: string | null;
  @ApiProperty({ type: Date, nullable: true }) approvedAt!: Date | null;
  @ApiProperty({ enum: TariffStatus }) status!: TariffStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedTariffResponseDto extends PaginatedResponseDto<TariffResponseDto> {
  @ApiProperty({ type: [TariffResponseDto] })
  override data: TariffResponseDto[] = [];
}
