export { DEFAULT_ROLE_NAMES, type DefaultRoleName } from "./roles";

// Populated by `pnpm --filter @hpp/contracts generate:api-types` once apps/api
// exposes real endpoints beyond /health (docs/28_OPENAPI_STRATEGY.md §1-2).
// Intentionally not imported/re-exported here until it exists, so a missing
// generated file never breaks this package's build.
