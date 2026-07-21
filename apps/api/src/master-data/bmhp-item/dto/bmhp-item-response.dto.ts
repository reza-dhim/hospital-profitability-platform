import { ApiProperty } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

/** Bahan Medis Habis Pakai — consumable medical materials (docs/02_DOMAIN_MODEL.md). */
export class BmhpItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ type: "string" }) standardCost!: string;
  @ApiProperty({ type: String, nullable: true }) vendorId!: string | null;
  @ApiProperty({ enum: MasterDataStatus }) status!: MasterDataStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedBmhpItemResponseDto extends PaginatedResponseDto<BmhpItemResponseDto> {
  @ApiProperty({ type: [BmhpItemResponseDto] })
  override data: BmhpItemResponseDto[] = [];
}
