import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { paginationMeta, PaginationMetaDto } from "../dto/pagination.dto";
import { buildListArgs, CrudFieldConfig, ListQueryOptions } from "../query/list-query.util";

/**
 * The subset of a Prisma model delegate (`prisma.costCenter`, `prisma.driver`,
 * ...) the generic engine needs. Typed with `any` args/returns deliberately —
 * each concrete Prisma delegate has its own generated, model-specific
 * argument/payload types, and there is no shared supertype for "any Prisma
 * model delegate" to constrain against. Callers get type safety back at the
 * edges: `MasterDataCrudService<TEntity, ...>`'s public methods return
 * `TEntity`, and each subclass's constructor passes the real
 * `prisma.<model>` delegate, so a typo in a field name still fails at the
 * `data: {...}` call site inside that subclass, just not inside this file.
 */
export interface CrudDelegate {
  findFirst(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
}

export interface MasterDataCrudOptions {
  /** Snake_case entity/table name — used for audit `entity`/`action` and as the human-readable name in error messages. */
  entity: string;
  notFoundCode: string;
  conflictCode: string;
  /** Defaults to "{Entity} code already exists." — override for entities whose unique constraint isn't a `code` column (e.g. `AllocationRule`'s compound key). */
  conflictMessage?: string;
  fieldConfig: CrudFieldConfig;
}

/**
 * Generic create/read/update/soft-delete engine shared by every hospital-
 * scoped master-data entity (docs/02_DOMAIN_MODEL.md §2, `ARCHITECT_AUDIT.md`
 * Sprint 3). Each entity gets a thin `XService extends MasterDataCrudService<...>`
 * (just a constructor wiring its Prisma delegate + `MasterDataCrudOptions`)
 * and a thin controller — this class is the one place tenant scoping,
 * pagination/search/filter/sort, soft-delete, unique-code conflict handling,
 * and audit-context recording are implemented (`AGENTS.md` reusability
 * principle: "every CRUD must include ..." — implemented once, not per
 * entity).
 *
 * `TEntity` must carry `id` (used for audit `entityId`); create/update DTOs
 * are expected to use the exact same field names as the Prisma model (e.g.
 * `code`, `name`, `profitCenterId`) so the default passthrough in
 * `toCreateData`/`toUpdateData` needs no per-entity mapping — entities with
 * extra invariants (e.g. `TariffService` superseding the prior active row)
 * override `create`/`update` directly rather than fighting a mapping hook.
 */
export abstract class MasterDataCrudService<
  TEntity extends { id: string },
  TCreateDto extends object,
  TUpdateDto extends object,
> {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly auditContextService: AuditContextService,
    protected readonly delegate: CrudDelegate,
    protected readonly options: MasterDataCrudOptions
  ) {}

  async create(hospitalId: string, dto: TCreateDto, actorUserId: string): Promise<TEntity> {
    const created = (await this.handleUniqueConstraint(() =>
      this.delegate.create({
        data: {
          ...this.toCreateData(dto),
          hospitalId,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
      })
    )) as TEntity;

    this.auditContextService.record({
      entity: this.options.entity,
      action: `${this.options.entity}.create`,
      entityId: created.id,
      before: null,
      after: created,
    });
    return created;
  }

  async findAll(
    hospitalId: string,
    query: ListQueryOptions
  ): Promise<{ data: TEntity[]; meta: PaginationMetaDto }> {
    const { where, orderBy, skip, take } = buildListArgs(query, this.options.fieldConfig, {
      hospitalId,
      deletedAt: null,
    });
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, orderBy, skip, take }) as Promise<TEntity[]>,
      this.delegate.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(hospitalId: string, id: string): Promise<TEntity> {
    const entity = (await this.delegate.findFirst({
      where: { id, hospitalId, deletedAt: null },
    })) as TEntity | null;
    if (!entity) throw this.notFound();
    return entity;
  }

  async update(hospitalId: string, id: string, dto: TUpdateDto, actorUserId: string): Promise<TEntity> {
    const before = await this.findOne(hospitalId, id);
    const after = (await this.handleUniqueConstraint(() =>
      this.delegate.update({
        where: { id },
        data: { ...this.toUpdateData(dto), updatedByUserId: actorUserId },
      })
    )) as TEntity;

    this.auditContextService.record({
      entity: this.options.entity,
      action: `${this.options.entity}.update`,
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async remove(hospitalId: string, id: string, actorUserId: string): Promise<void> {
    const before = await this.findOne(hospitalId, id);
    const after = await this.delegate.update({
      where: { id },
      data: { deletedAt: new Date(), updatedByUserId: actorUserId },
    });

    this.auditContextService.record({
      entity: this.options.entity,
      action: `${this.options.entity}.delete`,
      entityId: id,
      before,
      after,
    });
  }

  /** Override when a create DTO's fields don't map 1:1 onto the Prisma model's scalar columns. */
  protected toCreateData(dto: TCreateDto): Record<string, unknown> {
    return dto as Record<string, unknown>;
  }

  /** Override when an update DTO's fields don't map 1:1 onto the Prisma model's scalar columns. */
  protected toUpdateData(dto: TUpdateDto): Record<string, unknown> {
    return dto as Record<string, unknown>;
  }

  protected notFound(): NotFoundException {
    return new NotFoundException({
      code: this.options.notFoundCode,
      message: `${humanize(this.options.entity)} not found.`,
    });
  }

  private async handleUniqueConstraint<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: this.options.conflictCode,
          message: this.options.conflictMessage ?? `${humanize(this.options.entity)} code already exists.`,
        });
      }
      throw error;
    }
  }
}

function humanize(entity: string): string {
  return entity
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
