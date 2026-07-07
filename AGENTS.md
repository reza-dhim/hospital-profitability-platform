# AGENTS.md

You are building an Enterprise AI Hospital Profitability Intelligence Platform.

## Product Goal
Build a professional enterprise platform for:
- Cost center allocation
- Profit center profitability analysis
- Unit cost calculation
- AI tariff recommendation
- Doctor profitability analytics
- Executive dashboard
- AI decision support

## Mandatory Rules
- Read `/docs/PRODUCT_BIBLE.md` before coding.
- Read `/docs/DESIGN_SYSTEM.md` before creating UI.
- Read `/docs/DATABASE_SCHEMA.md` before creating database models.
- Read `/docs/API_SPEC.md` before creating API routes.
- Use TypeScript everywhere.
- Never hardcode business rules.
- Every page must include:
  - loading state
  - empty state
  - error state
  - success state
  - guided help / tooltip
- Every CRUD must include:
  - create
  - read
  - update
  - delete / soft delete
  - search
  - filter
  - sorting
  - pagination
  - import
  - export
  - audit trail
- UI must be modern, clean, premium, and enterprise-grade.
- Avoid generic vibe-coding UI.
- Follow reusable component architecture.
- Follow clean architecture.
- Prioritize maintainability over speed.

## Preferred Stack
Frontend:
- Next.js
- React
- TypeScript
- TailwindCSS
- shadcn/ui
- TanStack Table
- React Hook Form
- Zod
- Framer Motion
- ECharts

Backend:
- NestJS
- PostgreSQL
- Prisma
- Redis
- BullMQ

AI:
- OpenAI API
- RAG
- pgvector

## UX Principle
New users must be guided clearly using:
- onboarding wizard
- product tour
- smart empty state
- contextual tooltip
- template download guide
- upload validation guide
- AI assistant
