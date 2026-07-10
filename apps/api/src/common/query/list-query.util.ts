/**
 * Shared list-query parsing, used by every entity built on the generic CRUD
 * engine (`common/crud/master-data-crud.service.ts`) so pagination/search/
 * filter/sort are implemented once per docs/28_OPENAPI_STRATEGY.md §4 rather
 * than re-derived per entity (`AGENTS.md` "every CRUD must include ...
 * search, filter, sorting, pagination").
 */
export interface ListQueryOptions {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  filter?: Record<string, string>;
}

/** Per-entity allow-lists — an entity only opts a field into `?search=`/`?filter[x]=`/`?sort=` by listing it here. */
export interface CrudFieldConfig {
  /** Fields OR'd together with case-insensitive `contains` when `?search=` is given. */
  searchableFields: string[];
  /** Fields honored by `?filter[field]=value` (exact match). Unknown keys in the request are silently ignored. */
  filterableFields: string[];
  /** Fields honored by `?sort=field`/`?sort=-field`. An unknown/absent field falls back to `defaultSort` ascending. */
  sortableFields: string[];
  defaultSort: string;
}

export interface ListArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, "asc" | "desc">;
  skip: number;
  take: number;
}

export function buildListArgs(
  query: ListQueryOptions,
  config: CrudFieldConfig,
  baseWhere: Record<string, unknown>
): ListArgs {
  const where: Record<string, unknown> = { ...baseWhere };

  if (query.search && config.searchableFields.length > 0) {
    where.OR = config.searchableFields.map((field) => ({
      [field]: { contains: query.search, mode: "insensitive" as const },
    }));
  }

  if (query.filter) {
    for (const [key, value] of Object.entries(query.filter)) {
      if (config.filterableFields.includes(key) && value !== undefined && value !== "") {
        where[key] = value;
      }
    }
  }

  return {
    where,
    orderBy: parseSort(query.sort, config),
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  };
}

function parseSort(sort: string | undefined, config: CrudFieldConfig): Record<string, "asc" | "desc"> {
  if (!sort) return { [config.defaultSort]: "asc" };

  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  if (!config.sortableFields.includes(field)) {
    return { [config.defaultSort]: "asc" };
  }
  return { [field]: descending ? "desc" : "asc" };
}
