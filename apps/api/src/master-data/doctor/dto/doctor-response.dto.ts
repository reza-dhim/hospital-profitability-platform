import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class DoctorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() specialty?: string | null;
  @ApiProperty({ enum: MasterDataStatus }) status!: MasterDataStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedDoctorResponseDto extends PaginatedResponseDto<DoctorResponseDto> {
  @ApiProperty({ type: [DoctorResponseDto] })
  override data: DoctorResponseDto[] = [];
}
