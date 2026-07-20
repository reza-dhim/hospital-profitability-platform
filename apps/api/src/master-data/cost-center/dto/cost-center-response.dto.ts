import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CostCenterType, MasterDataStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class CostCenterResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: CostCenterType }) type!: CostCenterType;
  @ApiPropertyOptional() profitCenterId?: string | null;
  @ApiProperty({ enum: MasterDataStatus }) status!: MasterDataStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedCostCenterResponseDto extends PaginatedResponseDto<CostCenterResponseDto> {
  @ApiProperty({ type: [CostCenterResponseDto] })
  override data: CostCenterResponseDto[] = [];
}
