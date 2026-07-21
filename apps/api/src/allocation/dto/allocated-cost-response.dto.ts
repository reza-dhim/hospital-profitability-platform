import { ApiProperty } from "@nestjs/swagger";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

export class AllocatedCostResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() sourceCostCenterId!: string;
  @ApiProperty({ type: String, nullable: true, description: "Set for a step-down transfer into another cost center; null when the target is a profit center." })
  targetCostCenterId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: "Set when the target is a profit center; null for a step-down cost-center-to-cost-center transfer." })
  targetProfitCenterId!: string | null;
  @ApiProperty() driverId!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() createdAt!: Date;
}

export class PaginatedAllocatedCostResponseDto extends PaginatedResponseDto<AllocatedCostResponseDto> {
  @ApiProperty({ type: [AllocatedCostResponseDto] })
  override data: AllocatedCostResponseDto[] = [];
}
