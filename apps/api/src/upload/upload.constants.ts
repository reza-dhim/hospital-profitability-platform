import { UploadType } from "@prisma/client";

/**
 * Sprint 4 phased rollout (agreed at kickoff): only Cost + Revenue are
 * accepted through the intake endpoint for now. Driver/Asset/Employee/
 * Medical Activity/BMHP/Tariff are already modeled in the `UploadType` enum
 * (matches docs/02_DOMAIN_MODEL.md exactly) but land in a later sub-task —
 * see `UploadService.create()`'s use of this list.
 */
export const SUPPORTED_UPLOAD_TYPES: readonly UploadType[] = ["cost", "revenue"];

/**
 * Hard ceiling enforced by Multer before the request body is even fully
 * read — a blunt DoS guard, not the real limit. The real, per-hospital
 * configurable limit (`hospital_settings.max_upload_file_size_mb`, default
 * 25MB per docs/06_UPLOAD_ENGINE.md §3) is checked in `UploadService.create()`.
 */
export const MAX_UPLOAD_FILE_SIZE_CEILING_BYTES = 100 * 1024 * 1024;
