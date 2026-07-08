import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** `?page`/`?limit` per docs/28_OPENAPI_STRATEGY.md §Pagination (default 20, max 100). */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: "Free-text search, matched against the entity's name/code." })
  @IsOptional()
  @IsString()
  search?: string;
}

export class PaginationMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;
}

/**
 * Response envelope per docs/28_OPENAPI_STRATEGY.md §Pagination:
 * `{ data: [...], meta: { page, limit, total } }`. Concrete list endpoints
 * declare their own `@ApiOkResponse` with the specific item type — this base
 * class exists so the shape stays consistent, not for runtime use.
 */
export class PaginatedResponseDto<T> {
  data!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export function paginationMeta(page: number, limit: number, total: number): PaginationMetaDto {
  return { page, limit, total };
}
