import { ApiProperty } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class CostCenterResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ enum: MasterDataStatus }) status!: MasterDataStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedCostCenterResponseDto extends PaginatedResponseDto<CostCenterResponseDto> {
  @ApiProperty({ type: [CostCenterResponseDto] })
  override data: CostCenterResponseDto[] = [];
}
