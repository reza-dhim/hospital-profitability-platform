import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ReportType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ReportDataService } from "./report-data.service";
import { ReportRendererService } from "./report-renderer.service";

const PDF_CONTENT_TYPE = "application/pdf";
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface RenderedReport {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

/**
 * docs/15_REPORTING.md §2: every generation is persisted as a
 * `report_exports` row, and a plain `GET` (no `?regenerate=true`) reuses
 * the most recent existing export for that (hospital, reportType, period)
 * instead of re-rendering — "not regenerated in place... unless the user
 * explicitly asks to regenerate". File bytes are streamed directly from
 * `StorageService` (the same `putObject`/`getObject` pair
 * `UploadService`/`ParseService` already use), matching this codebase's
 * established file-download convention (`TemplateController.download()`
 * streams bytes directly too) rather than introducing a separate
 * signed-URL redirect just for this one route family.
 */
@Injectable()
export class ReportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly reportDataService: ReportDataService,
    private readonly reportRendererService: ReportRendererService
  ) {}

  async executiveSummaryPdf(
    hospitalId: string,
    organizationId: string,
    periodId: string,
    allocationRunId: string | undefined,
    regenerate: boolean,
    actorUserId: string
  ): Promise<RenderedReport> {
    return this.getOrGenerate(hospitalId, organizationId, "executive_summary", periodId, regenerate, actorUserId, async () => {
      const data = await this.reportDataService.buildExecutiveSummary(hospitalId, periodId, allocationRunId);
      const buffer = await this.reportRendererService.renderExecutiveSummaryPdf(data);
      return { buffer, contentType: PDF_CONTENT_TYPE, fileName: `executive-summary-${data.periodLabel}.pdf` };
    });
  }

  async profitabilityDetailExcel(
    hospitalId: string,
    organizationId: string,
    periodId: string,
    allocationRunId: string | undefined,
    regenerate: boolean,
    actorUserId: string
  ): Promise<RenderedReport> {
    return this.getOrGenerate(hospitalId, organizationId, "profitability_detail", periodId, regenerate, actorUserId, async () => {
      const data = await this.reportDataService.buildProfitabilityDetail(hospitalId, periodId, allocationRunId);
      const buffer = await this.reportRendererService.renderProfitabilityDetailExcel(data);
      return { buffer, contentType: XLSX_CONTENT_TYPE, fileName: `profitability-detail-${data.periodLabel}.xlsx` };
    });
  }

  async doctorAnalyticsPdf(
    hospitalId: string,
    organizationId: string,
    periodId: string,
    allocationRunId: string | undefined,
    regenerate: boolean,
    actorUserId: string,
    callerRoleName: string | null
  ): Promise<RenderedReport> {
    return this.getOrGenerate(hospitalId, organizationId, "doctor_analytics", periodId, regenerate, actorUserId, async () => {
      const data = await this.reportDataService.buildDoctorAnalytics(hospitalId, periodId, allocationRunId, callerRoleName);
      const buffer = await this.reportRendererService.renderDoctorAnalyticsPdf(data);
      return { buffer, contentType: PDF_CONTENT_TYPE, fileName: `doctor-analytics-${data.periodLabel}.pdf` };
    });
  }

  async list(hospitalId: string, periodId: string | undefined, page: number, limit: number) {
    const where = { hospitalId, ...(periodId ? { generatedForPeriodId: periodId } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.reportExport.findMany({
        where,
        orderBy: { generatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reportExport.count({ where }),
    ]);
    return { data, total };
  }

  private async getOrGenerate(
    hospitalId: string,
    organizationId: string,
    reportType: ReportType,
    periodId: string,
    regenerate: boolean,
    actorUserId: string,
    render: () => Promise<RenderedReport>
  ): Promise<RenderedReport> {
    if (!regenerate) {
      const existing = await this.prisma.reportExport.findFirst({
        where: { hospitalId, reportType, generatedForPeriodId: periodId },
        orderBy: { generatedAt: "desc" },
      });
      if (existing) {
        const buffer = await this.storageService.getObject(existing.fileUrl);
        const contentType = reportType === "profitability_detail" ? XLSX_CONTENT_TYPE : PDF_CONTENT_TYPE;
        const extension = reportType === "profitability_detail" ? "xlsx" : "pdf";
        return { buffer, contentType, fileName: `${reportType.replace(/_/g, "-")}-${existing.id}.${extension}` };
      }
    }

    const rendered = await render();
    const id = randomUUID();
    const key = this.buildReportKey(organizationId, hospitalId, id, rendered.fileName);
    await this.storageService.putObject(key, rendered.buffer, rendered.contentType);
    await this.prisma.reportExport.create({
      data: {
        id,
        hospitalId,
        reportType,
        generatedForPeriodId: periodId,
        fileUrl: key,
        generatedByUserId: actorUserId,
      },
    });
    return rendered;
  }

  private buildReportKey(organizationId: string, hospitalId: string, reportExportId: string, fileName: string): string {
    const extension = fileName.split(".").pop();
    return `${organizationId}/${hospitalId}/reports/${reportExportId}.${extension}`;
  }
}
