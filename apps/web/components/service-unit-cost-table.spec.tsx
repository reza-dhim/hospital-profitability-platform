import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServiceUnitCostTable } from "./service-unit-cost-table";
import { profitabilityApi } from "../lib/profitability-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/profitability-api", () => ({
  profitabilityApi: { profitCenters: vi.fn(), summary: vi.fn(), trends: vi.fn(), services: vi.fn() },
}));

const mockedProfitabilityApi = vi.mocked(profitabilityApi);

const profitCenter = {
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
};

function serviceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    serviceId: "svc-1",
    serviceCode: "SVC-001",
    serviceName: "Konsultasi",
    profitCenterId: "pc-1",
    serviceAllocatedCost: "5000000.00",
    serviceDirectCost: "0.00",
    serviceVolume: "100",
    unitCost: "50000.0000",
    currentTariff: "75000.00",
    tariffGap: "25000.00",
    targetMarginUsed: "15.0000",
    recommendedTariff: "58823.5294",
    unitCostVariance: null,
    ...overrides,
  };
}

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ServiceUnitCostTable periodId="period-1" />
    </QueryClientProvider>
  );
}

describe("ServiceUnitCostTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProfitabilityApi.profitCenters.mockResolvedValue({ allocationRunId: "run-1", data: [profitCenter] });
  });

  it("shows the 'not yet run' empty state on a NO_COMPLETED_ALLOCATION_RUN 404", async () => {
    mockedProfitabilityApi.services.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run.", traceId: "t1" })
    );

    renderTable();

    expect(await screen.findByText("Perhitungan belum dijalankan")).toBeInTheDocument();
  });

  it("shows a generic error state for any other failure", async () => {
    mockedProfitabilityApi.services.mockRejectedValue(new ApiRequestError(500, { code: "INTERNAL", message: "Boom.", traceId: "t1" }));

    renderTable();

    expect(await screen.findByText("Gagal memuat detail unit cost layanan.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no services", async () => {
    mockedProfitabilityApi.services.mockResolvedValue({ allocationRunId: "run-1", data: [] });

    renderTable();

    expect(await screen.findByText("Belum ada data layanan")).toBeInTheDocument();
  });

  it("renders a row with the profit center name resolved and every figure formatted", async () => {
    mockedProfitabilityApi.services.mockResolvedValue({ allocationRunId: "run-1", data: [serviceRow()] });

    renderTable();

    expect(await screen.findByText("SVC-001")).toBeInTheDocument();
    expect(screen.getByText("Konsultasi")).toBeInTheDocument();
    expect(screen.getByText("Rawat Jalan")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?50\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?75\.000/)).toBeInTheDocument();
    expect(screen.getByText("15.0%")).toBeInTheDocument();
    expect(screen.getByText("Tarif Rekomendasi (Kalkulasi)")).toBeInTheDocument();
  });

  it("shows dashes for the documented null states (no volume / no tariff / no gap / no recommendation)", async () => {
    mockedProfitabilityApi.services.mockResolvedValue({
      allocationRunId: "run-1",
      data: [
        serviceRow({
          serviceVolume: "0",
          unitCost: null,
          currentTariff: null,
          tariffGap: null,
          recommendedTariff: null,
        }),
      ],
    });

    renderTable();

    await screen.findByText("SVC-001");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("colors a negative tariff gap as destructive", async () => {
    mockedProfitabilityApi.services.mockResolvedValue({
      allocationRunId: "run-1",
      data: [serviceRow({ tariffGap: "-10000.00" })],
    });

    renderTable();

    const gapCell = await screen.findByText(/-Rp\s?10\.000/);
    expect(gapCell).toHaveClass("text-destructive");
  });
});
