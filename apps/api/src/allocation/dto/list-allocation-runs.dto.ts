import { ApiPropertyOptional } from "@nestjs/swagger";
import { AllocationRunStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";

export class ListAllocationRunsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AllocationRunStatus })
  @IsOptional()
  @IsEnum(AllocationRunStatus)
  status?: AllocationRunStatus;

  @ApiPropertyOptional({ description: "Filter to a single period." })
  @IsOptional()
  @IsUUID()
  periodId?: string;
}
