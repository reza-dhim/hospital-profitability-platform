import { apiRequest } from "./api-client";

export interface MasterDataPaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface MasterDataListResult<TEntity> {
  data: TEntity[];
  meta: MasterDataPaginationMeta;
}

export interface ListMasterDataQuery {
  page?: number;
  limit?: number;
  search?: string;
  /** `"field"` for ascending, `"-field"` for descending — see `common/query/list-query.util.ts`. */
  sort?: string;
  /** Exact-match filter, sent as `?filter[field]=value` per entity's `filterableFields` allow-list. */
  filter?: Record<string, string>;
}

export interface MasterDataApi<TEntity, TCreateDto, TUpdateDto> {
  list: (query?: ListMasterDataQuery) => Promise<MasterDataListResult<TEntity>>;
  get: (id: string) => Promise<TEntity>;
  create: (dto: TCreateDto) => Promise<TEntity>;
  update: (id: string, dto: TUpdateDto) => Promise<TEntity>;
  remove: (id: string) => Promise<void>;
}

function toQueryParams(query: ListMasterDataQuery): Record<string, string | number | boolean | undefined> {
  const { filter, ...rest } = query;
  const flat: Record<string, string | number | boolean | undefined> = { ...rest };
  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      flat[`filter[${key}]`] = value;
    }
  }
  return flat;
}

/**
 * Every master-data entity (`apps/api/src/master-data/*`) is built on the
 * same generic `MasterDataCrudService` — identical 5-endpoint REST shape,
 * identical pagination/search/filter/sort query contract
 * (`common/query/list-query.util.ts`), identical soft-delete semantics. This
 * factory mirrors that on the frontend instead of hand-writing the same
 * 5 methods per entity.
 */
export function createMasterDataApi<TEntity, TCreateDto, TUpdateDto>(
  resource: string
): MasterDataApi<TEntity, TCreateDto, TUpdateDto> {
  return {
    list: (query = {}) => apiRequest<MasterDataListResult<TEntity>>(`/${resource}`, { query: toQueryParams(query) }),
    get: (id) => apiRequest<TEntity>(`/${resource}/${id}`),
    create: (dto) => apiRequest<TEntity>(`/${resource}`, { method: "POST", body: dto }),
    update: (id, dto) => apiRequest<TEntity>(`/${resource}/${id}`, { method: "PATCH", body: dto }),
    remove: (id) => apiRequest<void>(`/${resource}/${id}`, { method: "DELETE" }),
  };
}
