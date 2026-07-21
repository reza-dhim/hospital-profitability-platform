import { ApiProperty } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class AssetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ type: String, nullable: true }) costCenterId!: string | null;
  @ApiProperty({ type: "string" }) acquisitionCost!: string;
  @ApiProperty() depreciationMethod!: string;
  @ApiProperty() usefulLifeMonths!: number;
  @ApiProperty({ enum: MasterDataStatus }) status!: MasterDataStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedAssetResponseDto extends PaginatedResponseDto<AssetResponseDto> {
  @ApiProperty({ type: [AssetResponseDto] })
  override data: AssetResponseDto[] = [];
}
