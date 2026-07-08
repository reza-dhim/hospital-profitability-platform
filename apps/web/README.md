# @hpp/web

Next.js (App Router) frontend for the Hospital Profitability Intelligence Platform.

Stack: Next.js, React, TypeScript, TailwindCSS, `@hpp/ui` (shadcn/ui-based component
library) — per `AGENTS.md`'s Preferred Stack.

## Sprint 1 Scope

This app currently ships the platform shell only: `AppShell`, `Sidebar`, `Topbar`,
and the 9 placeholder routes listed in `prompts/CODEX_INITIAL_PROMPT.md`, each
rendering `PageHeader` + `EmptyState` + `GuidedTooltip` with no data fetching.
See `docs/ARCHITECT_AUDIT.md` §Sprint Planning and `docs/00_DOCUMENTATION_INDEX.md`
for what's implemented in later sprints.

## Development

```bash
cp .env.example .env.local
pnpm --filter @hpp/web dev
```

Runs on http://localhost:3000. Requires `apps/api` running for any route beyond
Sprint 1's placeholders (not required yet, since no route fetches data).

## Scripts

| Command | Purpose |
|---|---|
| `pnpm --filter @hpp/web dev` | Start the dev server |
| `pnpm --filter @hpp/web build` | Production build |
| `pnpm --filter @hpp/web lint` | ESLint |
| `pnpm --filter @hpp/web typecheck` | `tsc --noEmit` |

## Structure

```
app/                 App Router routes (route groups, layouts, pages)
components/          App-specific compositions (not generic enough for @hpp/ui)
lib/                 Navigation config, API client, utilities
```

Reusable, presentational components (`AppShell`, `Sidebar`, `PageHeader`, `EmptyState`,
etc.) live in `packages/ui`, not here — see `docs/37_COMPONENT_LIBRARY.md` and
`docs/00_DOCUMENTATION_INDEX.md` §7 (package boundaries).
