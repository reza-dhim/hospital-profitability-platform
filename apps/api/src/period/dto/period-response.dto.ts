import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PeriodStatus } from "@prisma/client";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

export class PeriodResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty({ example: "2026-06" }) label!: string;
  @ApiProperty() startDate!: Date;
  @ApiProperty() endDate!: Date;
  @ApiProperty({ enum: PeriodStatus }) status!: PeriodStatus;
  @ApiPropertyOptional() lockedAt?: Date | null;
  @ApiPropertyOptional() closedAt?: Date | null;
  @ApiPropertyOptional() reopenedAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaginatedPeriodResponseDto extends PaginatedResponseDto<PeriodResponseDto> {
  @ApiProperty({ type: [PeriodResponseDto] })
  override data: PeriodResponseDto[] = [];
}
