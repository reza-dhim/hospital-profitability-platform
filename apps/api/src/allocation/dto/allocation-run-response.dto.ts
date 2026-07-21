import { ApiProperty } from "@nestjs/swagger";
import { AllocationMethod, AllocationRunStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

/** Shape written by `AllocationEngineService` — see its `result.warnings` type (currently the only code is `W_DRIVER_ZERO`). */
export class AllocationRunWarningDto {
  @ApiProperty() code!: string;
  @ApiProperty() costCenterId!: string;
  @ApiProperty() driverId!: string;
}

export class AllocationRunResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty({ enum: AllocationMethod }) method!: AllocationMethod;
  @ApiProperty({ enum: AllocationRunStatus }) status!: AllocationRunStatus;
  @ApiProperty({ type: Date, nullable: true }) startedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;
  @ApiProperty({
    description: "Run-level warnings that didn't fail the run, e.g. W_DRIVER_ZERO.",
    type: [AllocationRunWarningDto],
    nullable: true,
  })
  warnings!: AllocationRunWarningDto[] | null;
  @ApiProperty({ description: "Set by upload rollback for this run's period — see docs/01_BUSINESS_RULES.md §5." })
  isStale!: boolean;
  @ApiProperty({ type: Date, nullable: true }) staleAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) supersedesRunId!: string | null;
  @ApiProperty() createdByUserId!: string;
  @ApiProperty() createdAt!: Date;
}

export class PaginatedAllocationRunResponseDto extends PaginatedResponseDto<AllocationRunResponseDto> {
  @ApiProperty({ type: [AllocationRunResponseDto] })
  override data: AllocationRunResponseDto[] = [];
}
