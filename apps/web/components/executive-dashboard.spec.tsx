import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExecutiveDashboard } from "./executive-dashboard";
import { periodsApi } from "../lib/periods-api";
import { profitabilityApi } from "../lib/profitability-api";
import { allocationRunsApi } from "../lib/allocation-runs-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));
vi.mock("../lib/profitability-api", () => ({
  profitabilityApi: { summary: vi.fn(), profitCenters: vi.fn(), trends: vi.fn() },
}));
vi.mock("../lib/allocation-runs-api", () => ({ allocationRunsApi: { list: vi.fn() } }));

const mockedPeriodsApi = vi.mocked(periodsApi);
const mockedProfitabilityApi = vi.mocked(profitabilityApi);
const mockedAllocationRunsApi = vi.mocked(allocationRunsApi);

const periodJanuari = { id: "period-2026-01", hospitalId: "h1", label: "2026-01", startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-01T00:00:00Z", status: "open" as const, createdAt: "", updatedAt: "" };
const periodFebruari = { id: "period-2026-02", hospitalId: "h1", label: "2026-02", startDate: "2026-02-01T00:00:00Z", endDate: "2026-03-01T00:00:00Z", status: "open" as const, createdAt: "", updatedAt: "" };

function completedRun(periodId: string) {
  return {
    id: `run-${periodId}`,
    hospitalId: "h1",
    periodId,
    method: "step_down" as const,
    status: "completed" as const,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    errorMessage: null,
    warnings: null,
    isStale: false,
    staleAt: null,
    supersedesRunId: null,
    createdByUserId: "u1",
    createdAt: new Date().toISOString(),
  };
}

function renderWithQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExecutiveDashboard />
    </QueryClientProvider>
  );
}

describe("ExecutiveDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no completed runs, no ranking/trend data — overridden per test as needed.
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });
    mockedProfitabilityApi.profitCenters.mockResolvedValue({ allocationRunId: "run-1", data: [] });
    mockedProfitabilityApi.trends.mockResolvedValue({ profitCenterId: "pc-1", data: [] });
  });

  it("shows an empty state when no periods have been generated yet", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });

    renderWithQueryClient();

    expect(await screen.findByText("Belum ada periode")).toBeInTheDocument();
  });

  it("falls back to the most recent period overall when none has a completed run", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });
    mockedProfitabilityApi.summary.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run.", traceId: "t1" })
    );

    renderWithQueryClient();

    expect(await screen.findByText("Perhitungan belum dijalankan")).toBeInTheDocument();
    expect(mockedProfitabilityApi.summary).toHaveBeenCalledWith("period-2026-02");
    expect((screen.getByLabelText("Periode") as HTMLSelectElement).value).toBe("period-2026-02");
  });

  it("defaults to the period with a completed run, not the chronologically latest period", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [completedRun(periodJanuari.id)], meta: { page: 1, limit: 100, total: 1 } });
    mockedProfitabilityApi.summary.mockResolvedValue({
      allocationRunId: "run-1",
      periodId: periodJanuari.id,
      profitCenterCount: 0,
      totalRevenue: "0.00",
      totalCost: "0.00",
      totalGrossProfit: "0.00",
      overallMargin: null,
      totalRevenueVariance: null,
      totalCostVariance: null,
      totalGrossProfitVariance: null,
      overallMarginVariance: null,
    });

    renderWithQueryClient();

    await waitFor(() => expect(mockedProfitabilityApi.summary).toHaveBeenCalledWith("period-2026-01"));
    expect((screen.getByLabelText("Periode") as HTMLSelectElement).value).toBe("period-2026-01");
  });

  it("ignores a stale completed run when picking the default period", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });
    mockedAllocationRunsApi.list.mockResolvedValue({
      data: [{ ...completedRun(periodJanuari.id), isStale: true }],
      meta: { page: 1, limit: 100, total: 1 },
    });
    mockedProfitabilityApi.summary.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run.", traceId: "t1" })
    );

    renderWithQueryClient();

    await waitFor(() => expect(mockedProfitabilityApi.summary).toHaveBeenCalledWith("period-2026-02"));
  });

  it("renders the KPI strip with formatted values and variance trends on success", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari], meta: { page: 1, limit: 100, total: 1 } });
    mockedProfitabilityApi.summary.mockResolvedValue({
      allocationRunId: "run-1",
      periodId: periodJanuari.id,
      profitCenterCount: 6,
      totalRevenue: "100000000.00",
      totalCost: "80000000.00",
      totalGrossProfit: "20000000.00",
      overallMargin: "20.0000",
      totalRevenueVariance: { absolute: "5000000.00", percentage: "5.2632" },
      totalCostVariance: { absolute: "-1000000.00", percentage: "-1.2346" },
      totalGrossProfitVariance: null,
      overallMarginVariance: null,
    });
    mockedProfitabilityApi.profitCenters.mockResolvedValue({
      allocationRunId: "run-1",
      data: [
        { profitCenterId: "pc-1", profitCenterCode: "PC-A", profitCenterName: "Unit A", revenue: "100000000.00", directCost: "0.00", allocatedCost: "80000000.00", totalCost: "80000000.00", grossProfit: "20000000.00", margin: "20.0000", totalCostVariance: null },
      ],
    });
    mockedProfitabilityApi.trends.mockResolvedValue({
      profitCenterId: "pc-1",
      data: [{ periodId: periodJanuari.id, periodLabel: "2026-01", allocationRunId: "run-1", revenue: "100000000.00", grossProfit: "20000000.00", margin: "20.0000" }],
    });

    renderWithQueryClient();

    expect(await screen.findByText(/Rp\s?100\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?80\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?20\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    expect(screen.getByText(/\+Rp\s?5\.000\.000 \(\+5\.3%\)/)).toBeInTheDocument();
    expect(await screen.findByText("Peringkat Profit Center (Margin)")).toBeInTheDocument();
    await waitFor(() => expect(mockedProfitabilityApi.trends).toHaveBeenCalledWith("pc-1"));
    expect(screen.getByText("Tren Pendapatan per Profit Center")).toBeInTheDocument();
  });

  it("re-fetches the summary for the newly selected period when the user changes it", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });
    mockedProfitabilityApi.summary.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run.", traceId: "t1" })
    );
    const user = userEvent.setup();

    renderWithQueryClient();
    await waitFor(() => expect(mockedProfitabilityApi.summary).toHaveBeenCalledWith("period-2026-02"));

    await user.selectOptions(screen.getByLabelText("Periode"), "period-2026-01");

    await waitFor(() => expect(mockedProfitabilityApi.summary).toHaveBeenCalledWith("period-2026-01"));
  });

  it("shows a generic error state (with retry) for a non-404 failure", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari], meta: { page: 1, limit: 100, total: 1 } });
    mockedProfitabilityApi.summary.mockRejectedValue(
      new ApiRequestError(500, { code: "INTERNAL", message: "Boom.", traceId: "t1" })
    );

    renderWithQueryClient();

    expect(await screen.findByText("Gagal memuat ringkasan profitabilitas.")).toBeInTheDocument();
  });
});
