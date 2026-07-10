import { ApiProperty } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class CoaAccountResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedCoaAccountResponseDto extends PaginatedResponseDto<CoaAccountResponseDto> {
  @ApiProperty({ type: [CoaAccountResponseDto] })
  override data: CoaAccountResponseDto[] = [];
}
