import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type UploadBatch = components["schemas"]["UploadResponseDto"];
export type PaginatedUploadBatches = components["schemas"]["PaginatedUploadResponseDto"];
export type ValidationResult = components["schemas"]["ValidationResultResponseDto"];
export type ValidationError = components["schemas"]["ValidationErrorDto"];

/** The only types the backend actually implements — see `SUPPORTED_UPLOAD_TYPES` in `apps/api/src/upload/upload.constants.ts`. The `UploadType` enum has more values (asset/employee/etc.), all of which currently 501. */
export type SupportedUploadType = "cost" | "revenue" | "driver";

export interface ListUploadsQuery {
  type?: SupportedUploadType;
  status?: UploadBatch["status"];
  page?: number;
  limit?: number;
  [key: string]: string | number | boolean | undefined;
}

/** docs/06_UPLOAD_ENGINE.md — intake/read for the upload pipeline. */
export const uploadsApi = {
  list: (query: ListUploadsQuery = {}) => apiRequest<PaginatedUploadBatches>("/uploads", { query }),
  get: (id: string) => apiRequest<UploadBatch>(`/uploads/${id}`),

  /** `POST /uploads/:type` — multipart file + `periodId` form field. Rejected (422) unless the target period is `open`. */
  create: (type: SupportedUploadType, periodId: string, file: File) => {
    const form = new FormData();
    form.append("periodId", periodId);
    form.append("file", file);
    return apiRequest<UploadBatch>(`/uploads/${type}`, { method: "POST", body: form });
  },

  /** docs/07_VALIDATION_ENGINE.md §4 — row-level pass/fail detail, paginated (>200 errors). */
  getValidation: (id: string, query: { page?: number; limit?: number } = {}) =>
    apiRequest<ValidationResult>(`/uploads/${id}/validation`, { query }),

  /** `acknowledged: true` required if the batch has any warning-severity rows (docs/06_UPLOAD_ENGINE.md §2). 409 if not `validated`, 422 if the period closed since upload. */
  confirm: (id: string, acknowledged?: boolean) =>
    apiRequest<UploadBatch>(`/uploads/${id}/confirm`, { method: "POST", body: { acknowledged } }),

  /** Only on `confirmed` batches with the period still open — deletes the promoted rows and marks the period's allocation runs stale (docs/01_BUSINESS_RULES.md §5). */
  rollback: (id: string) => apiRequest<UploadBatch>(`/uploads/${id}/rollback`, { method: "POST" }),
};
