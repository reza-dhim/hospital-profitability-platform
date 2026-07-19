import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

export class AllocatedCostResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() sourceCostCenterId!: string;
  @ApiPropertyOptional() targetCostCenterId?: string | null;
  @ApiPropertyOptional() targetProfitCenterId?: string | null;
  @ApiProperty() driverId!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() createdAt!: Date;
}

export class PaginatedAllocatedCostResponseDto extends PaginatedResponseDto<AllocatedCostResponseDto> {
  @ApiProperty({ type: [AllocatedCostResponseDto] })
  override data: AllocatedCostResponseDto[] = [];
}
