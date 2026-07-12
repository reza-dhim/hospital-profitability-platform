import { buildListArgs, CrudFieldConfig } from "./list-query.util";

/**
 * Direct unit tests for the pure query-building logic every entity's
 * `CrudFieldConfig` runs through (`master-data-crud.service.spec.ts`
 * exercises this indirectly per-entity; this file pins down the mechanism
 * itself in isolation).
 */

const config: CrudFieldConfig = {
  searchableFields: ["code", "name"],
  filterableFields: ["status"],
  sortableFields: ["code", "name", "createdAt"],
  defaultSort: "name",
};

const baseWhere = { hospitalId: "hospital-1", deletedAt: null };

describe("buildListArgs", () => {
  it("returns baseWhere unmodified, defaultSort ascending, and page/limit-derived skip/take when no query params are given", () => {
    const result = buildListArgs({ page: 1, limit: 20 }, config, baseWhere);
    expect(result).toEqual({
      where: baseWhere,
      orderBy: { name: "asc" },
      skip: 0,
      take: 20,
    });
  });

  it("builds a case-insensitive OR across searchableFields when ?search= is given", () => {
    const result = buildListArgs({ page: 1, limit: 20, search: "term" }, config, baseWhere);
    expect(result.where.OR).toEqual([
      { code: { contains: "term", mode: "insensitive" } },
      { name: { contains: "term", mode: "insensitive" } },
    ]);
  });

  it("ignores ?search= entirely when the entity has no searchableFields", () => {
    const noSearchConfig: CrudFieldConfig = { ...config, searchableFields: [] };
    const result = buildListArgs({ page: 1, limit: 20, search: "term" }, noSearchConfig, baseWhere);
    expect(result.where.OR).toBeUndefined();
  });

  it("applies an allow-listed filter field", () => {
    const result = buildListArgs({ page: 1, limit: 20, filter: { status: "active" } }, config, baseWhere);
    expect(result.where.status).toBe("active");
  });

  it("silently ignores a filter key not in filterableFields", () => {
    const result = buildListArgs({ page: 1, limit: 20, filter: { notAllowlisted: "value" } }, config, baseWhere);
    expect(result.where.notAllowlisted).toBeUndefined();
  });

  it("ignores a filter value that is an empty string", () => {
    const result = buildListArgs({ page: 1, limit: 20, filter: { status: "" } }, config, baseWhere);
    expect(result.where.status).toBeUndefined();
  });

  it("sorts ascending on an allow-listed field with no '-' prefix", () => {
    const result = buildListArgs({ page: 1, limit: 20, sort: "code" }, config, baseWhere);
    expect(result.orderBy).toEqual({ code: "asc" });
  });

  it("sorts descending on an allow-listed field with a '-' prefix", () => {
    const result = buildListArgs({ page: 1, limit: 20, sort: "-code" }, config, baseWhere);
    expect(result.orderBy).toEqual({ code: "desc" });
  });

  it("falls back to defaultSort ascending for a field not in sortableFields", () => {
    const result = buildListArgs({ page: 1, limit: 20, sort: "-notSortable" }, config, baseWhere);
    expect(result.orderBy).toEqual({ name: "asc" });
  });

  it("computes skip/take from page and limit", () => {
    const result = buildListArgs({ page: 3, limit: 10 }, config, baseWhere);
    expect(result.skip).toBe(20);
    expect(result.take).toBe(10);
  });
});
