import { ApiProperty } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../../common/dto/pagination.dto";

export class AllocationRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() costCenterId!: string;
  @ApiProperty() driverId!: string;
  @ApiProperty() method!: string;
  @ApiProperty() priority!: number;
  @ApiProperty() effectivePeriod!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedAllocationRuleResponseDto extends PaginatedResponseDto<AllocationRuleResponseDto> {
  @ApiProperty({ type: [AllocationRuleResponseDto] })
  override data: AllocationRuleResponseDto[] = [];
}
