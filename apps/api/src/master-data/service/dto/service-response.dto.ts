import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

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

export class PaginatedServiceResponseDto extends PaginatedResponseDto<ServiceResponseDto> {
  @ApiProperty({ type: [ServiceResponseDto] })
  override data: ServiceResponseDto[] = [];
}
