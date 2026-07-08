# 12 — AI Engine

Status: Draft v1. Capability list: `PRODUCT_BIBLE.md` §8. Governance, approval gates, and safety constraints: `13_AI_GOVERNANCE.md` (read together with this document — this doc is the "what/how it works", `13_AI_GOVERNANCE.md` is the "what it's not allowed to do").

## 1. Capabilities (per `PRODUCT_BIBLE.md` §8)

| Capability | Endpoint (`API_SPEC.md`) | Output persisted to |
|---|---|---|
| Explain profit drop | `POST /ai/insights` | `ai_insights` |
| Tariff recommendation | `POST /ai/tariff-recommendation` | `ai_proposals` (status=pending) |
| Doctor cost variance insight | `POST /ai/doctor-analysis` | `ai_insights` |
| Cost anomaly detection | `POST /ai/insights` (type=anomaly) | `ai_insights` |
| What-if simulation | `POST /ai/what-if` | not persisted (ephemeral, see §5) |
| Copilot chat (reads dashboard for user) | `POST /ai/copilot/chat` | `ai_conversations`/`ai_messages` |

## 2. Architecture: RAG over Platform Data

- **What is embedded (pgvector)**: the platform's own computed outputs — `allocation_runs` summaries, `profitability_results`, `doctor_profitability_results` factor breakdowns, and prior `ai_insights` — chunked and embedded per hospital/period. **Not** raw row-level `cost_entries`/`revenue_entries` (too granular, not meaningful as retrieval units) and **not** any external medical/clinical knowledge base in v1.
- **Retrieval flow**: user query or triggered event → embed query → similarity search scoped to `hospital_id` (hard filter, never cross-tenant, per `03_MULTI_TENANT.md`) → top-K chunks + the specific numeric context (e.g., the exact `profitability_results` row being explained) assembled into the prompt → LLM call → response with citations back to source row IDs.
- **Every AI response includes `citations_json`**: an array of `{ entityType, entityId, allocationRunId }` pointing to the exact rows used, rendered in the UI as clickable references back to the underlying data (addresses the "AI explainability" gap in `ARCHITECT_AUDIT.md`).

## 3. Model & Cost Strategy

- Provider: OpenAI API (per `AGENTS.md` preferred stack). Model tiering: a smaller/cheaper model for retrieval-query embedding and simple classification (anomaly flagging), a stronger model for narrative generation (insights, tariff rationale, copilot chat).
- Per-organization monthly token budget configurable in `hospital_settings` (or an org-level billing table in a future billing doc); requests beyond budget degrade gracefully to "AI temporarily unavailable, formula-based figures still available" rather than a hard failure of the whole dashboard — AI is additive, never a dependency for core numbers (`08_COST_ALLOCATION_ENGINE.md` through `10_UNIT_COST_ENGINE.md` never depend on AI).

## 4. What-If Simulation

- Ephemeral, request-scoped: user adjusts a hypothetical input (e.g., "+10% volume on Radiologi"), the engine re-runs the `09_PROFITABILITY_ENGINE.md`/`10_UNIT_COST_ENGINE.md` formulas in-memory with the adjusted input against the latest completed run's data, and returns the delta. Never writes to any table, never affects the "official" numbers. Clearly labeled "Simulation — not saved" in the UI.

## 5. Copilot Chat

- Scoped read-only assistant: can query and explain the user's own hospital's data (via the RAG layer + tool-calling into read APIs like `profitability/summary`), cannot execute writes, cannot cross hospitals. Streaming response (SSE or chunked HTTP) for UX responsiveness — see `28_OPENAPI_STRATEGY.md` for how streaming endpoints are documented outside standard OpenAPI request/response pairs.
- Conversation history (`ai_conversations`/`ai_messages`) retained per `26_DATA_RETENTION.md`; context window management: last N messages + retrieved chunks, older messages summarized rather than dropped once the conversation exceeds the model's context budget.

## 6. Explicit Non-Goals for MVP

- No autonomous write actions of any kind (see `13_AI_GOVERNANCE.md` §1 for the hard rule).
- No fine-tuning on hospital-specific data in v1 — RAG only, to keep the data-privacy boundary simple and auditable (`13_AI_GOVERNANCE.md` §2).
- No clinical/medical-appropriateness judgments — the AI reasons about cost and financial variance, never clinical quality or medical necessity.
