import { ApiProperty } from "@nestjs/swagger";

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
