import { Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { tenantRlsExtension } from "./tenant-rls.extension";

/**
 * DI token / structural type only — `PrismaModule`'s factory provider (see
 * `createPrismaService` below) is what actually supplies the runtime value,
 * an RLS-extended client cast to this type (structurally compatible: an
 * extended client is a strict superset of `PrismaClient`'s surface, never a
 * subset). Every consumer keeps writing
 * `constructor(private readonly prisma: PrismaService)` unchanged — Nest
 * resolves by this class reference regardless of how the provider is wired.
 *
 * Never instantiate this directly (`new PrismaService()`): that would
 * bypass `$extends()` entirely and RLS session variables
 * (docs/03_MULTI_TENANT.md §2) would never be set.
 */
export abstract class PrismaService extends PrismaClient {}

const logger = new Logger("PrismaService");

/**
 * Connects via `APP_DATABASE_URL` — the non-owner `hpp_app` role created by
 * `prisma/migrations/20260713120000_add_row_level_security` — never
 * `DATABASE_URL` (the schema-owner role Prisma CLI uses for
 * `migrate deploy`/`migrate dev`/`db seed`). Postgres table owners bypass
 * row-level security; only a non-owner role is actually subject to the RLS
 * policies that migration creates.
 */
export function createPrismaService(tenantContextService: TenantContextService): PrismaService {
  const baseClient = new PrismaClient({
    datasources: { db: { url: process.env.APP_DATABASE_URL } },
  });

  const extended = baseClient.$extends(tenantRlsExtension(tenantContextService)).$extends({
    client: {
      async onModuleInit() {
        await baseClient.$connect();
        logger.log("Database connection established");
      },
      async onModuleDestroy() {
        await baseClient.$disconnect();
      },
    },
  });

  return extended as unknown as PrismaService;
}
