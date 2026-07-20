import { ApiPropertyOptional } from "@nestjs/swagger";
import { TargetMarginScopeType } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";

export class ListTargetMarginsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TargetMarginScopeType })
  @IsOptional()
  @IsEnum(TargetMarginScopeType)
  scopeType?: TargetMarginScopeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeId?: string;
}
