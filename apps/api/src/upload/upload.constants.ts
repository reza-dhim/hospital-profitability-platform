import { UploadType } from "@prisma/client";

/**
 * Sprint 4 phased rollout (agreed at kickoff) added Cost + Revenue; Sprint 5
 * sub-task 0 adds Driver (a hard prerequisite for the Cost Allocation
 * Engine — driver percentages have no other data source). Asset, Employee,
 * BMHP, and Tariff bulk-create the master-data entities of the same name —
 * insert-only, not upsert (a duplicate `code` is a validation error,
 * matching each entity's own `@@unique([hospitalId, code])`; corrections
 * still go through Master Data CRUD, not a re-upload). `medical_activity`
 * (Sprint 8) is period-scoped, append-only case-level data — same insert/
 * hard-delete-rollback shape as cost/revenue/driver, not the insert-only
 * master-data shape — and is the prerequisite for `service_direct_cost`
 * and doctor-level profitability (docs/10_UNIT_COST_ENGINE.md §2,
 * docs/11_DOCTOR_ANALYTICS.md §2).
 */
export const SUPPORTED_UPLOAD_TYPES: readonly UploadType[] = [
  "cost",
  "revenue",
  "driver",
  "asset",
  "employee",
  "bmhp",
  "tariff",
  "medical_activity",
];

/**
 * Hard ceiling enforced by Multer before the request body is even fully
 * read — a blunt DoS guard, not the real limit. The real, per-hospital
 * configurable limit (`hospital_settings.max_upload_file_size_mb`, default
 * 25MB per docs/06_UPLOAD_ENGINE.md §3) is checked in `UploadService.create()`.
 */
export const MAX_UPLOAD_FILE_SIZE_CEILING_BYTES = 100 * 1024 * 1024;
