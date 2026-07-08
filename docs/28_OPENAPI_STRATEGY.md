# 28 — OpenAPI Strategy

Status: Draft v1 — resolves the "no request/response schemas" gap in `ARCHITECT_AUDIT.md`. Builds on the route list in `API_SPEC.md`.

## 1. Source of Truth

- The OpenAPI spec is **generated from code**, not hand-written separately: NestJS `@nestjs/swagger` decorators on every DTO and controller produce the spec automatically at build time. `API_SPEC.md` remains the human-readable route index; the generated `openapi.json` (served at `/api/docs-json` once scaffolded, with Swagger UI at `/api/docs`) is the binding contract for frontend codegen and any external integration (`27_INTEGRATION.md` §4).
- This prevents the drift that produced the original gap — a hand-maintained spec document inevitably falls behind the code; a generated one cannot.

## 2. Frontend Contract Consumption

- The Next.js frontend generates a typed API client from the OpenAPI spec (e.g., `openapi-typescript` + a thin fetch wrapper), so request/response types are shared, not manually re-declared in the frontend — a change to a DTO breaks the frontend build immediately if consumers aren't updated, rather than failing silently at runtime.

## 3. Versioning

- Base path `/api/v1` (per `API_SPEC.md`) is a breaking-change boundary. Additive changes (new optional field, new endpoint) ship within `v1`. Breaking changes (removed/renamed field, changed semantics) require a `v2` path prefix, with `v1` maintained in parallel for a documented deprecation window (minimum 90 days) communicated via `16_NOTIFICATION.md` to any integration users (`27_INTEGRATION.md`).

## 4. Conventions Applied Platform-Wide (baked into the generated spec, not restated per-endpoint)

- **Pagination**: `?page`, `?limit` (default 20, max 100), response envelope `{ data: [...], meta: { page, limit, total } }`.
- **Filtering**: `?filter[field]=value` for exact-match; documented per-endpoint filterable fields in each module's generated schema.
- **Sorting**: `?sort=field` / `?sort=-field` (descending).
- **Error shape**: per `17_ERROR_HANDLING.md` §1, applied via a global NestJS exception filter so every endpoint's error responses are automatically consistent in the generated spec.
- **Auth**: Bearer JWT (`05_AUTHENTICATION.md`), documented once as a global `securityScheme`, referenced per protected endpoint.

## 5. Streaming Endpoints

- `POST /ai/copilot/chat` (`12_AI_ENGINE.md` §5) uses Server-Sent Events, which OpenAPI 3.0 cannot fully describe natively — documented via a supplementary AsyncAPI-style note in the endpoint description rather than forced into the request/response schema format, so frontend engineers aren't misled by an inaccurate generated type.

## 6. Contract Testing

- CI includes a contract test that fails the build if a controller's actual response shape diverges from its declared DTO (`33_TESTING_STRATEGY.md` §Contract Tests) — catches the case where a developer manually adds a field to a response object without updating the DTO.
