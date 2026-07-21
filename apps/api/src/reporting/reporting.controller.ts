import { Controller, Get, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { ReportExportService } from "./report-export.service";
import { GenerateReportQueryDto } from "./dto/generate-report-query.dto";
import { ListReportExportsQueryDto } from "./dto/list-report-exports-query.dto";
import { ReportExportResponseDto, PaginatedReportExportResponseDto } from "./dto/report-export-response.dto";

const PDF_CONTENT_TYPE = "application/pdf";
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** docs/15_REPORTING.md. Scheduling (`report_schedules`, recurring generation, email delivery) is deferred — no SMTP/email provider exists yet. */
@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
export class ReportingController {
  constructor(private readonly reportExportService: ReportExportService) {}

  @Get("executive/pdf")
  @RequirePermissions("reports.export")
  @ApiOperation({ summary: "Executive Summary PDF — KPI header, revenue/cost/margin trend, top/bottom 5 profit centers." })
  @ApiProduces(PDF_CONTENT_TYPE)
  async executivePdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query() query: GenerateReportQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const hospitalId = requireHospitalId(tenant);
    const report = await this.reportExportService.executiveSummaryPdf(
      hospitalId,
      tenant.organizationId,
      query.periodId,
      query.allocationRunId,
      query.regenerate ?? false,
      user.sub
    );
    this.send(res, report);
  }

  @Get("profitability/excel")
  @RequirePermissions("reports.export")
  @ApiOperation({ summary: "Profitability Detail Excel — per-profit-center rollup, per-service drill-down, raw data sheet." })
  @ApiProduces(XLSX_CONTENT_TYPE)
  async profitabilityExcel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query() query: GenerateReportQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const hospitalId = requireHospitalId(tenant);
    const report = await this.reportExportService.profitabilityDetailExcel(
      hospitalId,
      tenant.organizationId,
      query.periodId,
      query.allocationRunId,
      query.regenerate ?? false,
      user.sub
    );
    this.send(res, report);
  }

  @Get("doctor-analytics/pdf")
  @RequirePermissions("reports.export")
  @ApiOperation({
    summary:
      "Doctor Analytics PDF — per-service cohort comparison. Doctor-identified detail only included when the requester holds doctor_analytics.read_detail (docs/04_RBAC.md §5).",
  })
  @ApiProduces(PDF_CONTENT_TYPE)
  async doctorAnalyticsPdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query() query: GenerateReportQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const hospitalId = requireHospitalId(tenant);
    const report = await this.reportExportService.doctorAnalyticsPdf(
      hospitalId,
      tenant.organizationId,
      query.periodId,
      query.allocationRunId,
      query.regenerate ?? false,
      user.sub,
      user.role
    );
    this.send(res, report);
  }

  @Get("exports")
  @RequirePermissions("reports.read")
  @ApiOperation({ summary: "List past report generations for this hospital (docs/15_REPORTING.md §2 — every generation is persisted)." })
  @ApiOkResponse({ type: PaginatedReportExportResponseDto })
  async listExports(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListReportExportsQueryDto
  ): Promise<{ data: ReportExportResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const hospitalId = requireHospitalId(tenant);
    const { data, total } = await this.reportExportService.list(hospitalId, query.periodId, query.page, query.limit);
    return {
      data: data.map((row) => ({
        id: row.id,
        reportType: row.reportType,
        generatedForPeriodId: row.generatedForPeriodId,
        generatedByUserId: row.generatedByUserId,
        generatedAt: row.generatedAt,
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  private send(res: Response, report: { buffer: Buffer; contentType: string; fileName: string }): void {
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
    res.send(report.buffer);
  }
}
