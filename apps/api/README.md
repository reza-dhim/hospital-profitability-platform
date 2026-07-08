# @hpp/api

NestJS backend for the Hospital Profitability Intelligence Platform.

Stack: NestJS, TypeScript, Prisma, PostgreSQL, Redis/BullMQ (from Sprint 4 onward)
— per `AGENTS.md`'s Preferred Stack. Modular monolith organized by bounded context,
per `docs/ARCHITECT_AUDIT.md`'s Engineering Recommendation.

## Sprint 1 Scope

Only `GET /health` is implemented. The nine bounded-context modules (`auth`,
`master-data`, `upload`, `allocation`, `profitability`, `doctor-analytics`, `ai`,
`reporting`, `audit`) are registered in `AppModule` — proving the module graph
is real — but every route beyond health returns `501 Not Implemented` until the
sprint that owns it (see each controller's doc-comment, and
`docs/00_DOCUMENTATION_INDEX.md`). The Prisma schema covers only the Tenancy +
Identity entity groups (`docs/02_DOMAIN_MODEL.md` §1); all other entities are
added in the sprint that owns them.

## Development

```bash
docker compose up -d          # from repo root — starts Postgres + Redis
cp .env.example .env
pnpm --filter @hpp/api prisma:migrate
pnpm --filter @hpp/api prisma:seed
pnpm --filter @hpp/api start:dev
```

Runs on http://localhost:3001. Swagger UI at `/api/docs`, raw OpenAPI JSON at
`/api/docs-json` (consumed by `packages/types`' codegen script once real DTOs exist
— see `docs/28_OPENAPI_STRATEGY.md`).

## Scripts

| Command | Purpose |
|---|---|
| `pnpm --filter @hpp/api start:dev` | Start with hot reload |
| `pnpm --filter @hpp/api build` | Compile to `dist/` |
| `pnpm --filter @hpp/api start` | Run the compiled build |
| `pnpm --filter @hpp/api lint` | ESLint |
| `pnpm --filter @hpp/api typecheck` | `tsc --noEmit` |
| `pnpm --filter @hpp/api test` | Jest |
| `pnpm --filter @hpp/api prisma:migrate` | Create/apply a dev migration |
| `pnpm --filter @hpp/api prisma:deploy` | Apply pending migrations (CI/prod) |
| `pnpm --filter @hpp/api prisma:seed` | Seed the fixture hospital + default roles |

## Structure

```
src/
  main.ts, app.module.ts    Bootstrap and module graph
  config/                    Env validation (ConfigModule)
  prisma/                    PrismaService/PrismaModule
  health/                    GET /health
  common/                    Global exception filter, audit interceptor skeleton, DTOs
  auth/ master-data/ upload/ allocation/ profitability/
  doctor-analytics/ ai/ reporting/ audit/   Bounded-context module skeletons
prisma/
  schema.prisma              Tenancy + Identity entities (Sprint 1 scope)
  seed.ts                    Fixture organization/hospital/roles
```
