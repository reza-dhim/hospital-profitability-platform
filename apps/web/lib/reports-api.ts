import type { components } from "@hpp/contracts";
import { apiRequest, apiRequestFile, type DownloadedFile } from "./api-client";

export type ReportExport = components["schemas"]["ReportExportResponseDto"];
export type ReportType = ReportExport["reportType"];

export interface GenerateReportParams {
  periodId: string;
  allocationRunId?: string;
  regenerate?: boolean;
  [key: string]: string | boolean | undefined;
}

/** docs/15_REPORTING.md — every generation is persisted (`report_exports`); a plain call reuses the latest existing export for that (type, period) unless `regenerate: true`. */
export const reportsApi = {
  executivePdf: (params: GenerateReportParams): Promise<DownloadedFile> =>
    apiRequestFile("/reports/executive/pdf", "executive-summary.pdf", { query: params }),

  profitabilityExcel: (params: GenerateReportParams): Promise<DownloadedFile> =>
    apiRequestFile("/reports/profitability/excel", "profitability-detail.xlsx", { query: params }),

  doctorAnalyticsPdf: (params: GenerateReportParams): Promise<DownloadedFile> =>
    apiRequestFile("/reports/doctor-analytics/pdf", "doctor-analytics.pdf", { query: params }),

  listExports: (periodId?: string) =>
    apiRequest<{ data: ReportExport[]; meta: { page: number; limit: number; total: number } }>("/reports/exports", {
      query: { periodId, limit: 20 },
    }),
};
