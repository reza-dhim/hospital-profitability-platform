import { ApiProperty } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class DriverResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedDriverResponseDto extends PaginatedResponseDto<DriverResponseDto> {
  @ApiProperty({ type: [DriverResponseDto] })
  override data: DriverResponseDto[] = [];
}
