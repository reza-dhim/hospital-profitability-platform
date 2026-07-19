import { ApiProperty } from "@nestjs/swagger";
import { AllocationMethod } from "@prisma/client";
import { IsEnum, IsUUID } from "class-validator";

export class CreateAllocationRunDto {
  @ApiProperty({ description: "Period to allocate. Must belong to the caller's hospital." })
  @IsUUID()
  periodId!: string;

  @ApiProperty({ enum: AllocationMethod })
  @IsEnum(AllocationMethod)
  method!: AllocationMethod;
}
