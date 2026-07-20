import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfitCenterRanking } from "./profit-center-ranking";
import { profitabilityApi } from "../lib/profitability-api";

vi.mock("../lib/profitability-api", () => ({ profitabilityApi: { profitCenters: vi.fn(), trends: vi.fn() } }));

const mockedProfitabilityApi = vi.mocked(profitabilityApi);

function renderWithQueryClient(periodId = "period-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfitCenterRanking periodId={periodId} />
    </QueryClientProvider>
  );
}

describe("ProfitCenterRanking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders every profit center with a defined margin, and lists those without revenue separately", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({
      allocationRunId: "run-1",
      data: [
        { profitCenterId: "pc-1", profitCenterCode: "PC-A", profitCenterName: "Unit A", revenue: "100", directCost: "0", allocatedCost: "50", totalCost: "50", grossProfit: "50", margin: "50.0000", totalCostVariance: null },
        { profitCenterId: "pc-2", profitCenterCode: "PC-B", profitCenterName: "Unit B", revenue: "0", directCost: "0", allocatedCost: "20", totalCost: "20", grossProfit: "-20", margin: null, totalCostVariance: null },
      ],
    });

    renderWithQueryClient();

    expect(await screen.findByText("Peringkat Profit Center (Margin)")).toBeInTheDocument();
    expect(await screen.findByText(/Belum ada pendapatan periode ini: Unit B/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no profit centers", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({ allocationRunId: "run-1", data: [] });

    renderWithQueryClient();

    expect(await screen.findByText("Belum ada profit center")).toBeInTheDocument();
  });

  it("shows an error state with retry on failure", async () => {
    mockedProfitabilityApi.profitCenters.mockRejectedValue(new Error("boom"));

    renderWithQueryClient();

    expect(await screen.findByText("Gagal memuat peringkat profit center.")).toBeInTheDocument();
  });
});
