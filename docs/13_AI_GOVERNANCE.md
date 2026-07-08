# 13 — AI Governance

Status: Draft v1 — resolves the "Missing AI Requirement" gaps in `ARCHITECT_AUDIT.md` (guardrails, data privacy, explainability, human-in-the-loop). Read together with `12_AI_ENGINE.md`. Fairness rule for doctor data: `01_BUSINESS_RULES.md` §7.

## 1. Human-in-the-Loop — Hard Rule

**AI never writes directly to a business-of-record table** (`tariffs`, `target_margins`, `services`, or any master/transactional data). Every AI recommendation that could influence a business decision is persisted as an `ai_proposals` row with `status = pending` and requires explicit human approval (`CFO/Finance Director` for tariff/target-revenue proposals, per `01_BUSINESS_RULES.md` §8) before it affects anything a user sees as "official." This is enforced at the service layer: the `AiProposalService` is the *only* code path with write access to propose changes, and it has no code path that transitions a proposal to `accepted` other than the explicit approval endpoint.

## 2. Data Privacy Boundary

- Data sent to the OpenAI API is limited to: the retrieved RAG chunks (computed/aggregated platform data, per `12_AI_ENGINE.md` §2) and the user's natural-language query/context. Raw PII (doctor names, patient-identifying fields — note: this platform does not store patient-identifiable data at all, only aggregate `medical_activities`) is minimized; doctor **names** are pseudonymized (`doctor_code`) in any payload sent externally where feasible, with re-identification happening client-side after the response returns, for any AI feature that doesn't structurally require the name in-model.
- A Data Processing Agreement (DPA) with the AI provider must be executed before production launch (business/legal action item, tracked here as a launch blocker, not an engineering task).
- Organizations must be able to see, in `24_CONFIGURATION.md`, that AI features are enabled and what data category is shared — an explicit opt-in toggle per hospital, defaulting to **off** until the org's admin acknowledges the data-sharing notice.

## 3. Explainability Requirement

Every AI-generated insight or proposal must include:
1. A natural-language explanation.
2. `citations_json` pointing to the specific underlying rows/run used (`12_AI_ENGINE.md` §2).
3. For tariff proposals specifically: the formula-based `recommended_tariff` (`10_UNIT_COST_ENGINE.md`) shown side-by-side as a sanity baseline, so a CFO can see how far the AI's suggestion deviates from pure unit-cost math and why.

An AI output that cannot produce a citation (e.g., a general question outside the retrieved context) must say so explicitly rather than fabricate a reference — enforced via prompt instructions and a post-generation check that every claimed figure appears in the retrieved context.

## 4. Doctor-Analytics Language Constraints

Per `01_BUSINESS_RULES.md` §7, AI narrative about doctor variance is restricted to explanatory, non-comparative-punitive framing:
- Permitted: "This case had 15 minutes longer duration than the service median, contributing an estimated Rp X to the cost delta."
- Not permitted: rankings ("Dr. X is the least efficient"), scoring, or any output implying disciplinary consequence. Enforced via system-prompt constraints plus a keyword/pattern post-filter that blocks generation containing ranking or judgment language before it reaches the user; a blocked generation is regenerated once with a stricter prompt, and if it still fails, falls back to a template-based factual summary instead of a free-form LLM response.

## 5. Guardrails Summary Table

| Risk | Control |
|---|---|
| AI silently changes a tariff | Proposal-only writes, human approval required (§1) |
| Hallucinated financial figures | Mandatory citations, post-generation grounding check (§3) |
| Doctor data used punitively | Language constraints + post-filter (§4) |
| Hospital data leaves boundary uncontrolled | Org-level opt-in, pseudonymization, DPA (§2) |
| Runaway AI spend | Token budget + graceful degradation (`12_AI_ENGINE.md` §3) |
| Cross-tenant data leakage via RAG | Hard `hospital_id` filter on every retrieval (`12_AI_ENGINE.md` §2, `03_MULTI_TENANT.md`) |

## 6. Feedback Loop

- Every AI insight/proposal carries a thumbs-up/down + optional free-text correction, stored against the `ai_insights`/`ai_proposals` row. Not used for automated retraining in v1 (no fine-tuning per `12_AI_ENGINE.md` §6) — reviewed manually by the product team to refine prompts and retrieval quality over time.

## 7. Audit

Every `ai_proposals` status transition (`pending → accepted/rejected`) and every AI-opt-in toggle change is written to `audit_logs` (`23_AUDIT_TRAIL.md`), including the reviewing user and timestamp.
