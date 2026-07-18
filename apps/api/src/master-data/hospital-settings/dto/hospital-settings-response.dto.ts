import { ApiProperty } from "@nestjs/swagger";
import { AllocationMethod } from "@prisma/client";

export class HospitalSettingsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty({ enum: AllocationMethod }) allocationMethod!: AllocationMethod;
  @ApiProperty({ type: "string" }) defaultTargetMargin!: unknown;
  @ApiProperty() fiscalYearStartMonth!: number;
  @ApiProperty() locale!: string;
  @ApiProperty() maxUploadFileSizeMb!: number;
  @ApiProperty({ type: "string" }) outlierStddevMultiplier!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
