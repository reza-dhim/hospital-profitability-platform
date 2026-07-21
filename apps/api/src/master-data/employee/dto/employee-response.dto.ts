import { ApiProperty } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class EmployeeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) roleTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentCostCenterId!: string | null;
  @ApiProperty() employmentType!: string;
  @ApiProperty({ enum: MasterDataStatus }) status!: MasterDataStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedEmployeeResponseDto extends PaginatedResponseDto<EmployeeResponseDto> {
  @ApiProperty({ type: [EmployeeResponseDto] })
  override data: EmployeeResponseDto[] = [];
}
