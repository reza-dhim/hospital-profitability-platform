# 06 — Upload Engine

Status: Draft v1 — resolves the "Upload Engine" recommendation in `ARCHITECT_AUDIT.md`. Data types per `PRD.md` §Bulk Upload. Staging entities per `02_DOMAIN_MODEL.md`. Validation rules detailed separately in `07_VALIDATION_ENGINE.md`. Rollback business rule: `01_BUSINESS_RULES.md` §5.

## 1. Supported Upload Types

Cost, Revenue, Driver, Asset, Employee, Medical Activity, BMHP, Tariff — one Excel template per type (per `PRD.md`). Each template is versioned (`template_version` embedded as a hidden header row) so the engine can detect and reject uploads against a stale template.

## 2. Pipeline (Two-Phase, per `ARCHITECT_AUDIT.md` recommendation)

```
1. Download Template     GET  /templates/:type/download
2. Upload File            POST /uploads/:type            → creates upload_batches (status=staged)
3. Async Parse & Stage     [BullMQ job]                    → rows into upload_rows_staging
4. Async Validate          [BullMQ job]                    → validation_errors (see 07_VALIDATION_ENGINE.md)
                                                              upload_batches.status = validated | failed
5. Preview                GET  /uploads/:id/validation     → row-level pass/fail summary
6. Confirm                POST /uploads/:id/confirm        → promotes valid staged rows to live tables (transaction)
                                                              upload_batches.status = confirmed
7. Rollback (optional)     POST /uploads/:id/rollback      → removes promoted rows for this batch (period must be open)
```

- Parsing and validation are asynchronous (BullMQ + Redis) so large files (see `21_NON_FUNCTIONAL_REQUIREMENTS.md` for row-count targets) never block the request thread. The frontend polls `GET /uploads/:id` for `status`, or receives a push via the notification system (`16_NOTIFICATION.md`).
- **Confirm is all-or-nothing per batch**: rows flagged `error` severity block confirmation of the entire batch; rows flagged `warning` severity may be confirmed with an explicit user acknowledgment checkbox. See `07_VALIDATION_ENGINE.md` for severity definitions.
- Confirmation runs inside a single DB transaction: either all valid staged rows are promoted to `cost_entries`/`revenue_entries`/etc., or none are, on failure.

## 3. File Constraints

- Formats accepted: `.xlsx` only (not `.xls`, not `.csv`) — ensures template structure/data-validation features survive.
- Max file size: 25 MB (configurable per hospital in `24_CONFIGURATION.md`, escalation path documented for hospitals exceeding this via chunked/multi-file upload — Phase 2).
- Max rows per file: 50,000 (soft cap; beyond this, the UI recommends splitting by period/cost-center range).

## 4. Security Controls (see also `14_SECURITY.md`)

- MIME-type and file-signature validation (not just extension) before parsing.
- Formula-injection protection: any cell beginning with `=`, `+`, `-`, `@` is treated as literal text, never evaluated, when read server-side (prevents CSV/Excel formula injection attacks on downstream export/open).
- Virus scan on upload (ClamAV or hosted equivalent) before the file is queued for parsing; infected files are rejected with `upload_batches.status = failed` and never reach the parse stage.
- Uploaded files are stored in S3-compatible storage under a tenant-prefixed key (`{org_id}/{hospital_id}/uploads/{upload_batch_id}.xlsx`) with access via short-lived signed URLs only — never public.

## 5. Versioning

- `upload_batches` retains the original file (`file_url`) indefinitely (subject to `26_DATA_RETENTION.md`) so any upload can be re-inspected or re-validated against a newer rule set.
- Re-uploading corrected data for the same period does **not** overwrite a prior confirmed batch; it is a new `upload_batches` row. The prior batch's promoted rows remain in the transactional tables unless explicitly rolled back — duplicate-row detection across batches for the same period is a validation rule (`07_VALIDATION_ENGINE.md`).

## 6. Guided Upload UX

Per `AGENTS.md`/`UX_ONBOARDING_GUIDE.md`, every upload flow must present: template download prompt (empty state), drag-and-drop dropzone (`UploadDropzone` component, `37_COMPONENT_LIBRARY.md`), inline progress during async validation, and a `ValidationResult` panel summarizing pass/fail/warning counts with drill-down to row-level errors before confirmation is enabled.
