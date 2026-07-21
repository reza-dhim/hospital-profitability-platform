import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type HospitalSettings = components["schemas"]["HospitalSettingsResponseDto"];
export type UpdateHospitalSettingsDto = components["schemas"]["UpdateHospitalSettingsDto"];

/** Singleton — no list/create/delete, unlike the 12 Master Data entities (docs/24_CONFIGURATION.md). */
export const hospitalSettingsApi = {
  get: () => apiRequest<HospitalSettings>("/hospital-settings"),
  update: (dto: UpdateHospitalSettingsDto) => apiRequest<HospitalSettings>("/hospital-settings", { method: "PATCH", body: dto }),
};
