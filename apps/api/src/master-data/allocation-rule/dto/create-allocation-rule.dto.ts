import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsString, Min, MaxLength, MinLength } from "class-validator";

/** docs/08_COST_ALLOCATION_ENGINE.md §2 — links a cost center to the driver used to spread its pool. */
export class CreateAllocationRuleDto {
  @ApiProperty({ description: "Cost center whose pool is being distributed." })
  @IsString()
  costCenterId!: string;

  @ApiProperty({ description: "Driver used to compute each target's share." })
  @IsString()
  driverId!: string;

  @ApiProperty({ example: "step_down", description: "Free-form allocation method label for this rule." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  method!: string;

  @ApiProperty({ example: 1, description: "Ascending priority — lower runs earlier in step-down processing." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority!: number;

  @ApiProperty({ example: "2026-06", description: "Period this rule takes effect from (e.g. \"2026-06\")." })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  effectivePeriod!: string;
}
