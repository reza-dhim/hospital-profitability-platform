import { ApiPropertyOptional } from "@nestjs/swagger";
import { PeriodStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";

/**
 * Periods have exactly one filterable field (`status`), so this takes a
 * plain typed query param rather than the generic `?filter[field]=value`
 * mechanism `ListQueryDto` uses for the many-filterable-field CRUD entities
 * (`common/query/list-query.util.ts`) — not worth the generic machinery here.
 */
export class ListPeriodsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PeriodStatus })
  @IsOptional()
  @IsEnum(PeriodStatus)
  status?: PeriodStatus;
}
