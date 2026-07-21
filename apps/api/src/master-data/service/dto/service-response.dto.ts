import { ApiProperty } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class ServiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() profitCenterId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() serviceType!: string;
  @ApiProperty({ type: Number, nullable: true }) standardDuration!: number | null;
  @ApiProperty({ type: String, nullable: true, description: "Denormalized from the active Tariff row." })
  currentTariff!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedServiceResponseDto extends PaginatedResponseDto<ServiceResponseDto> {
  @ApiProperty({ type: [ServiceResponseDto] })
  override data: ServiceResponseDto[] = [];
}
