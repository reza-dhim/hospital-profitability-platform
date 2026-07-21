import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Reports } from "./reports";
import { periodsApi } from "../lib/periods-api";
import { reportsApi } from "../lib/reports-api";
import { triggerBrowserDownload } from "../lib/download-file";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));
vi.mock("../lib/reports-api", () => ({
  reportsApi: { executivePdf: vi.fn(), profitabilityExcel: vi.fn(), doctorAnalyticsPdf: vi.fn(), listExports: vi.fn() },
}));
vi.mock("../lib/download-file", () => ({ triggerBrowserDownload: vi.fn() }));

const mockedPeriodsApi = vi.mocked(periodsApi);
const mockedReportsApi = vi.mocked(reportsApi);
const mockedTriggerDownload = vi.mocked(triggerBrowserDownload);

const period = {
  id: "period-1",
  hospitalId: "h1",
  label: "2026-06",
  startDate: "2026-06-01T00:00:00Z",
  endDate: "2026-07-01T00:00:00Z",
  status: "open" as const,
  createdAt: "",
  updatedAt: "",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Reports />
    </QueryClientProvider>
  );
}

describe("Reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriodsApi.list.mockResolvedValue({ data: [period], meta: { page: 1, limit: 100, total: 1 } });
    mockedReportsApi.listExports.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  it("keeps the generate buttons disabled until a period is selected", async () => {
    renderPage();
    expect(await screen.findByRole("option", { name: "2026-06" })).toBeInTheDocument();

    const generateButtons = screen.getAllByRole("button", { name: "Buat / Unduh" });
    expect(generateButtons).toHaveLength(3);
    generateButtons.forEach((button) => expect(button).toBeDisabled());
  });

  it("generates the Executive Summary PDF with regenerate:false and triggers a browser download on 'Buat / Unduh'", async () => {
    mockedReportsApi.executivePdf.mockResolvedValue({ blob: new Blob(["pdf"]), fileName: "executive-summary.pdf" });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");
    // REPORT_CARDS order: Executive Summary (0), Profitability Detail (1), Doctor Analytics (2).
    await user.click(screen.getAllByRole("button", { name: "Buat / Unduh" })[0]!);

    await waitFor(() =>
      expect(mockedReportsApi.executivePdf).toHaveBeenCalledWith({ periodId: "period-1", regenerate: false })
    );
    await waitFor(() => expect(mockedTriggerDownload).toHaveBeenCalledWith(expect.any(Blob), "executive-summary.pdf"));
  });

  it("passes regenerate:true when 'Buat Ulang' is clicked", async () => {
    mockedReportsApi.profitabilityExcel.mockResolvedValue({ blob: new Blob(["xlsx"]), fileName: "profitability-detail.xlsx" });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");
    await user.click(screen.getAllByRole("button", { name: "Buat Ulang" })[1]!);

    await waitFor(() =>
      expect(mockedReportsApi.profitabilityExcel).toHaveBeenCalledWith({ periodId: "period-1", regenerate: true })
    );
  });

  it("shows the API's error message when generation fails, without triggering a download", async () => {
    mockedReportsApi.doctorAnalyticsPdf.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run for this period.", traceId: "t1" })
    );
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");
    await user.click(screen.getAllByRole("button", { name: "Buat / Unduh" })[2]!);

    expect(await screen.findByText("No completed run for this period.")).toBeInTheDocument();
    expect(mockedTriggerDownload).not.toHaveBeenCalled();
  });

  it("shows the report history table for the selected period once loaded", async () => {
    mockedReportsApi.listExports.mockResolvedValue({
      data: [
        { id: "export-1", reportType: "executive_summary", generatedForPeriodId: "period-1", generatedByUserId: "user-1", generatedAt: "2026-06-15T10:00:00Z" },
      ],
      meta: { page: 1, limit: 20, total: 1 },
    });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");

    expect(await screen.findByText("Executive Summary (PDF)")).toBeInTheDocument();
  });

  it("shows an empty state when no reports have been generated yet for the selected period", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");

    expect(await screen.findByText("Belum ada laporan")).toBeInTheDocument();
  });
});
