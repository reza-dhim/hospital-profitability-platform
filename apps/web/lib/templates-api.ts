import { apiRequestFile, type DownloadedFile } from "./api-client";
import type { SupportedUploadType } from "./uploads-api";

/** docs/06_UPLOAD_ENGINE.md §1 — versioned `.xlsx` template per upload type. Gated by `upload.read` (download isn't a mutation). */
export const templatesApi = {
  download: (type: SupportedUploadType): Promise<DownloadedFile> =>
    apiRequestFile(`/templates/${type}/download`, `${type}-template.xlsx`),
};
