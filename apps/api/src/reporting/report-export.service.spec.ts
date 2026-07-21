import { ReportExportService } from "./report-export.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";
import type { ReportDataService } from "./report-data.service";
import type { ReportRendererService } from "./report-renderer.service";

function makeDeps(existingExport: unknown = null) {
  const prisma = {
    reportExport: {
      findFirst: jest.fn().mockResolvedValue(existingExport),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;

  const storageService = {
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(Buffer.from("cached-bytes")),
  } as unknown as StorageService;

  const reportDataService = {
    buildExecutiveSummary: jest.fn().mockResolvedValue({ periodLabel: "2026-06" }),
  } as unknown as ReportDataService;

  const reportRendererService = {
    renderExecutiveSummaryPdf: jest.fn().mockResolvedValue(Buffer.from("fresh-bytes")),
  } as unknown as ReportRendererService;

  return { prisma, storageService, reportDataService, reportRendererService };
}

describe("ReportExportService — versioning (docs/15_REPORTING.md §2, 'not regenerated in place')", () => {
  it("reuses the existing export's stored bytes and does not re-render or create a new row when regenerate is false and an export already exists", async () => {
    const existing = { id: "export-1", fileUrl: "org1/h1/reports/export-1.pdf" };
    const deps = makeDeps(existing);
    const service = new ReportExportService(deps.prisma, deps.storageService, deps.reportDataService, deps.reportRendererService);

    const result = await service.executiveSummaryPdf("h1", "org1", "period-1", undefined, false, "user-1");

    expect(result.buffer.toString()).toBe("cached-bytes");
    expect(deps.storageService.getObject).toHaveBeenCalledWith(existing.fileUrl);
    expect(deps.reportDataService.buildExecutiveSummary).not.toHaveBeenCalled();
    expect(deps.prisma.reportExport.create).not.toHaveBeenCalled();
  });

  it("renders fresh and creates a new report_exports row when no prior export exists, even with regenerate false", async () => {
    const deps = makeDeps(null);
    const service = new ReportExportService(deps.prisma, deps.storageService, deps.reportDataService, deps.reportRendererService);

    const result = await service.executiveSummaryPdf("h1", "org1", "period-1", undefined, false, "user-1");

    expect(result.buffer.toString()).toBe("fresh-bytes");
    expect(deps.reportDataService.buildExecutiveSummary).toHaveBeenCalledWith("h1", "period-1", undefined);
    expect(deps.storageService.putObject).toHaveBeenCalledTimes(1);
    expect(deps.prisma.reportExport.create).toHaveBeenCalledTimes(1);
    const createArgs = (deps.prisma.reportExport.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data).toMatchObject({ hospitalId: "h1", reportType: "executive_summary", generatedForPeriodId: "period-1", generatedByUserId: "user-1" });
  });

  it("renders fresh and creates a new row even when a prior export exists, when regenerate is true", async () => {
    const existing = { id: "export-1", fileUrl: "org1/h1/reports/export-1.pdf" };
    const deps = makeDeps(existing);
    const service = new ReportExportService(deps.prisma, deps.storageService, deps.reportDataService, deps.reportRendererService);

    const result = await service.executiveSummaryPdf("h1", "org1", "period-1", undefined, true, "user-1");

    expect(result.buffer.toString()).toBe("fresh-bytes");
    expect(deps.prisma.reportExport.findFirst).not.toHaveBeenCalled();
    expect(deps.prisma.reportExport.create).toHaveBeenCalledTimes(1);
  });
});
