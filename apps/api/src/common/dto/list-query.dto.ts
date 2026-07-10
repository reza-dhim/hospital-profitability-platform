import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "./pagination.dto";

/**
 * Adds `?sort` to `PaginationQueryDto` per docs/28_OPENAPI_STRATEGY.md §4
 * ("`?sort=field` / `?sort=-field` (descending)"). `?filter[field]=value` is
 * deliberately not a property here: the global `ValidationPipe` runs with
 * `whitelist: true` (main.ts), which would strip an undeclared nested
 * `filter` object before a controller ever saw it, and each entity's set of
 * filterable fields differs — so list endpoints built on the generic CRUD
 * engine (`common/crud/master-data-crud.service.ts`) take it as a separate
 * `@Query("filter") filter?: Record<string, string>` controller parameter
 * instead, validated against that entity's own allow-list in
 * `buildListArgs()` (`common/query/list-query.util.ts`).
 */
export class ListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Sort field; prefix with "-" for descending, e.g. "-createdAt".' })
  @IsOptional()
  @IsString()
  sort?: string;
}
