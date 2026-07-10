import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class ProfitCenterResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() department?: string | null;
  @ApiProperty({ enum: MasterDataStatus }) status!: MasterDataStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedProfitCenterResponseDto extends PaginatedResponseDto<ProfitCenterResponseDto> {
  @ApiProperty({ type: [ProfitCenterResponseDto] })
  override data: ProfitCenterResponseDto[] = [];
}
