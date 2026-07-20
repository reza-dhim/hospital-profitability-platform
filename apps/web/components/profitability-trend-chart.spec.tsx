import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfitabilityTrendChart } from "./profitability-trend-chart";
import { profitabilityApi } from "../lib/profitability-api";

vi.mock("../lib/profitability-api", () => ({ profitabilityApi: { profitCenters: vi.fn(), trends: vi.fn() } }));

const mockedProfitabilityApi = vi.mocked(profitabilityApi);

function renderWithQueryClient(periodId = "period-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfitabilityTrendChart periodId={periodId} />
    </QueryClientProvider>
  );
}

describe("ProfitabilityTrendChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders a trend series per profit center", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({
      allocationRunId: "run-1",
      data: [
        { profitCenterId: "pc-1", profitCenterCode: "PC-A", profitCenterName: "Unit A", revenue: "100", directCost: "0", allocatedCost: "50", totalCost: "50", grossProfit: "50", margin: "50.0000", totalCostVariance: null },
      ],
    });
    mockedProfitabilityApi.trends.mockResolvedValue({
      profitCenterId: "pc-1",
      data: [{ periodId: "period-1", periodLabel: "2026-01", allocationRunId: "run-1", revenue: "100000", grossProfit: "50000", margin: "50.0000" }],
    });

    renderWithQueryClient();

    await waitFor(() => expect(mockedProfitabilityApi.trends).toHaveBeenCalledWith("pc-1"));
    expect(screen.getByText("Tren Pendapatan per Profit Center")).toBeInTheDocument();
  });

  it("shows an empty state when there are no profit centers to trend", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({ allocationRunId: "run-1", data: [] });

    renderWithQueryClient();

    expect(await screen.findByText("Belum ada tren")).toBeInTheDocument();
  });

  it("shows an error state when the trend fetch fails", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({
      allocationRunId: "run-1",
      data: [
        { profitCenterId: "pc-1", profitCenterCode: "PC-A", profitCenterName: "Unit A", revenue: "100", directCost: "0", allocatedCost: "50", totalCost: "50", grossProfit: "50", margin: "50.0000", totalCostVariance: null },
      ],
    });
    mockedProfitabilityApi.trends.mockRejectedValue(new Error("boom"));

    renderWithQueryClient();

    expect(await screen.findByText("Gagal memuat tren profitabilitas.")).toBeInTheDocument();
  });
});
