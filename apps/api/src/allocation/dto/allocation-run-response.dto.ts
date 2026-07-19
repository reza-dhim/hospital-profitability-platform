import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AllocationMethod, AllocationRunStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

export class AllocationRunResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty({ enum: AllocationMethod }) method!: AllocationMethod;
  @ApiProperty({ enum: AllocationRunStatus }) status!: AllocationRunStatus;
  @ApiPropertyOptional() startedAt?: Date | null;
  @ApiPropertyOptional() finishedAt?: Date | null;
  @ApiPropertyOptional() errorMessage?: string | null;
  @ApiPropertyOptional({
    description: "Run-level warnings that didn't fail the run, e.g. W_DRIVER_ZERO.",
    type: "array",
    items: { type: "object" },
  })
  warnings?: unknown;
  @ApiProperty({ description: "Set by upload rollback for this run's period — see docs/01_BUSINESS_RULES.md §5." })
  isStale!: boolean;
  @ApiPropertyOptional() staleAt?: Date | null;
  @ApiPropertyOptional() supersedesRunId?: string | null;
  @ApiProperty() createdByUserId!: string;
  @ApiProperty() createdAt!: Date;
}

export class PaginatedAllocationRunResponseDto extends PaginatedResponseDto<AllocationRunResponseDto> {
  @ApiProperty({ type: [AllocationRunResponseDto] })
  override data: AllocationRunResponseDto[] = [];
}
