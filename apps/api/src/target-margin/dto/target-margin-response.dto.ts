import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TargetMarginScopeType } from "@prisma/client";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

export class TargetMarginResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty({ enum: TargetMarginScopeType }) scopeType!: TargetMarginScopeType;
  @ApiPropertyOptional() scopeId?: string | null;
  @ApiProperty() targetMargin!: string;
  @ApiProperty() effectivePeriodId!: string;
  @ApiProperty() setByUserId!: string;
  @ApiProperty() createdAt!: Date;
}

export class PaginatedTargetMarginResponseDto extends PaginatedResponseDto<TargetMarginResponseDto> {
  @ApiProperty({ type: [TargetMarginResponseDto] })
  override data: TargetMarginResponseDto[] = [];
}
