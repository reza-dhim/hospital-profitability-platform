import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfitCenterDetailTable } from "./profit-center-detail-table";
import { profitabilityApi } from "../lib/profitability-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/profitability-api", () => ({
  profitabilityApi: { profitCenters: vi.fn(), summary: vi.fn(), trends: vi.fn(), services: vi.fn() },
}));

const mockedProfitabilityApi = vi.mocked(profitabilityApi);

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    profitCenterId: "pc-1",
    profitCenterCode: "PC-RJ",
    profitCenterName: "Rawat Jalan",
    revenue: "100000000.00",
    directCost: "0.00",
    allocatedCost: "20000000.00",
    totalCost: "20000000.00",
    grossProfit: "80000000.00",
    margin: "80.0000",
    totalCostVariance: null,
    ...overrides,
  };
}

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfitCenterDetailTable periodId="period-1" />
    </QueryClientProvider>
  );
}

describe("ProfitCenterDetailTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the 'not yet run' empty state on a NO_COMPLETED_ALLOCATION_RUN 404", async () => {
    mockedProfitabilityApi.profitCenters.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run.", traceId: "t1" })
    );

    renderTable();

    expect(await screen.findByText("Perhitungan belum dijalankan")).toBeInTheDocument();
  });

  it("shows a generic error state for any other failure", async () => {
    mockedProfitabilityApi.profitCenters.mockRejectedValue(
      new ApiRequestError(500, { code: "INTERNAL", message: "Boom.", traceId: "t1" })
    );

    renderTable();

    expect(await screen.findByText("Gagal memuat detail profit center.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no profit centers", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({ allocationRunId: "run-1", data: [] });

    renderTable();

    expect(await screen.findByText("Belum ada profit center")).toBeInTheDocument();
  });

  it("renders formatted rows, including a dash for null margin", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({
      allocationRunId: "run-1",
      data: [row({ margin: null })],
    });

    renderTable();

    expect(await screen.findByText("PC-RJ")).toBeInTheDocument();
    expect(screen.getByText("Rawat Jalan")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?100\.000\.000/)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("sorts client-side by clicking a sortable column header", async () => {
    mockedProfitabilityApi.profitCenters.mockResolvedValue({
      allocationRunId: "run-1",
      data: [
        row({ profitCenterId: "pc-1", profitCenterCode: "PC-B", profitCenterName: "B", margin: "10.0000" }),
        row({ profitCenterId: "pc-2", profitCenterCode: "PC-A", profitCenterName: "A", margin: "50.0000" }),
      ],
    });
    const user = userEvent.setup();

    renderTable();
    await screen.findByText("PC-B");

    await user.click(screen.getByRole("button", { name: /Kode/ }));

    const cells = screen.getAllByRole("cell").map((cell) => cell.textContent);
    // Ascending by code: PC-A should now precede PC-B in document order.
    expect(cells.indexOf("PC-A")).toBeLessThan(cells.indexOf("PC-B"));
  });
});
