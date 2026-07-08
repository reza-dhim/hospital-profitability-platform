# Hospital Profitability Intelligence Platform

Enterprise AI platform untuk rumah sakit dalam menghitung:
- Cost Center Allocation
- Profit Center Profitability
- Unit Cost
- Tariff Recommendation
- Doctor Cost & Profitability Analytics
- Executive Decision Support

## Recommended Stack
Frontend: Next.js, React, TypeScript, TailwindCSS, shadcn/ui  
Backend: NestJS, PostgreSQL, Prisma, Redis, BullMQ  
AI: OpenAI API, RAG, pgvector  
Storage: S3-compatible storage

## Development Strategy
Jangan bangun semua fitur sekaligus. Gunakan sprint bertahap:

1. Project setup + design system
2. Auth + RBAC
3. Master data
4. Bulk upload template
5. Validation engine
6. Cost allocation engine
7. Profitability dashboard
8. AI recommendation
9. Doctor analytics
10. Reporting

## Documentation

Start at [`docs/00_DOCUMENTATION_INDEX.md`](docs/00_DOCUMENTATION_INDEX.md) — it lists every
document in `/docs` and the recommended reading order for developers and AI coding agents.
`AGENTS.md` and [`docs/PRODUCT_BIBLE.md`](docs/PRODUCT_BIBLE.md) are mandatory reading before
any code change.

## Repository Layout

This is a pnpm + Turborepo monorepo:

```
apps/
  web/    Next.js frontend (App Router)
  api/    NestJS backend
packages/
  ui/        Shared, reusable component library
  domain/    Framework-free business formulas (docs/18_FORMULA_REFERENCE.md), imported by apps/api only
  contracts/ Shared TypeScript types (incl. OpenAPI-generated API types)
  config/    Shared ESLint / TypeScript / Tailwind configuration
```

## Getting Started (Local Development)

Prerequisites: Node.js 20+, [pnpm](https://pnpm.io) 9.x, Docker.

```bash
# 1. Start local Postgres + Redis
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Apply database migrations and seed fixture data
pnpm --filter @hpp/api prisma:migrate
pnpm --filter @hpp/api prisma:seed

# 5. Run both apps
pnpm dev
```

- API: http://localhost:3001 (Swagger docs at `/api/docs`)
- Web: http://localhost:3000

## Common Commands

```bash
pnpm build       # build all apps/packages (Turborepo)
pnpm lint        # lint all apps/packages
pnpm typecheck   # typecheck all apps/packages
pnpm test        # run test suites
```

See [`apps/web/README.md`](apps/web/README.md) and [`apps/api/README.md`](apps/api/README.md)
for app-specific detail.
