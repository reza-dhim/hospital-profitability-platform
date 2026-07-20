import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TargetMarginScopeType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsString, IsUUID, Max, Min, ValidateIf } from "class-validator";

export class CreateTargetMarginDto {
  @ApiProperty({ enum: TargetMarginScopeType })
  @IsEnum(TargetMarginScopeType)
  scopeType!: TargetMarginScopeType;

  @ApiPropertyOptional({
    description: "Profit center or service id. Required when scopeType is profit_center or service; must be omitted for hospital.",
  })
  @ValidateIf((dto: CreateTargetMarginDto) => dto.scopeType !== TargetMarginScopeType.hospital)
  @IsString()
  scopeId?: string;

  @ApiProperty({ example: 15, description: "Percentage (15 means 15%), not a 0-1 fraction — see target-margin.service.ts." })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99.99)
  targetMargin!: number;

  @ApiProperty({ description: "Period this margin takes effect from — applies to every later period until superseded." })
  @IsUUID()
  effectivePeriodId!: string;
}
