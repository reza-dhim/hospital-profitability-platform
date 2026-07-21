import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WhatIfSimulation } from "./what-if-simulation";
import { periodsApi } from "../lib/periods-api";
import { profitabilityApi } from "../lib/profitability-api";
import { whatIfApi } from "../lib/what-if-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));
vi.mock("../lib/profitability-api", () => ({ profitabilityApi: { services: vi.fn() } }));
vi.mock("../lib/what-if-api", () => ({ whatIfApi: { simulate: vi.fn() } }));

const mockedPeriodsApi = vi.mocked(periodsApi);
const mockedProfitabilityApi = vi.mocked(profitabilityApi);
const mockedWhatIfApi = vi.mocked(whatIfApi);

const period = {
  id: "period-1",
  hospitalId: "h1",
  label: "2026-01",
  startDate: "2026-01-01T00:00:00Z",
  endDate: "2026-02-01T00:00:00Z",
  status: "open" as const,
  createdAt: "",
  updatedAt: "",
};

const serviceRow = {
  serviceId: "svc-1",
  serviceCode: "SVC-1",
  serviceName: "Konsultasi",
  profitCenterId: "pc-1",
  serviceAllocatedCost: "2000000.00",
  serviceDirectCost: "1000000.00",
  serviceVolume: "100.00",
  unitCost: "30000.0000",
  currentTariff: "50000.00",
  tariffGap: "20000.0000",
  targetMarginUsed: "20.0000",
  recommendedTariff: "37500.0000",
  unitCostVariance: null,
};

function simulationResult() {
  return {
    allocationRunId: "run-1",
    periodId: "period-1",
    serviceId: "svc-1",
    serviceCode: "SVC-1",
    serviceName: "Konsultasi",
    profitCenterId: "pc-1",
    profitCenterCode: "PC-1",
    profitCenterName: "Poli Umum",
    serviceBaseline: {
      tariff: "50000.00",
      volume: "100.00",
      allocatedCost: "2000000.00",
      directCost: "1000000.00",
      totalCost: "3000000.00",
      unitCost: "30000.0000",
      tariffGap: "20000.0000",
      recommendedTariff: "37500.0000",
      revenue: "5000000.00",
    },
    serviceHypothetical: {
      tariff: "60000.00",
      volume: "150.00",
      allocatedCost: "2000000.00",
      directCost: "1500000.00",
      totalCost: "3500000.00",
      unitCost: "23333.3333",
      tariffGap: "36666.6667",
      recommendedTariff: "29166.6667",
      revenue: "9000000.00",
    },
    serviceDeltas: {
      revenue: { absolute: "4000000.00", percentage: "80.0000" },
      totalCost: { absolute: "500000.00", percentage: "16.6667" },
      unitCost: { absolute: "-6666.6667", percentage: "-22.2222" },
      tariffGap: { absolute: "16666.6667", percentage: "83.3333" },
    },
    profitCenterBaseline: {
      revenue: "20000000.00",
      directCost: "6000000.00",
      allocatedCost: "4000000.00",
      totalCost: "10000000.00",
      grossProfit: "10000000.00",
      margin: "50.0000",
    },
    profitCenterHypothetical: {
      revenue: "24000000.00",
      directCost: "6000000.00",
      allocatedCost: "4000000.00",
      totalCost: "10000000.00",
      grossProfit: "14000000.00",
      margin: "58.3333",
    },
    profitCenterDeltas: {
      revenue: { absolute: "4000000.00", percentage: "20.0000" },
      grossProfit: { absolute: "4000000.00", percentage: "40.0000" },
      margin: { absolute: "8.3333", percentage: "16.6667" },
    },
  };
}

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WhatIfSimulation />
    </QueryClientProvider>
  );
}

describe("WhatIfSimulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriodsApi.list.mockResolvedValue({ data: [period], meta: { page: 1, limit: 100, total: 1 } });
    mockedProfitabilityApi.services.mockResolvedValue({ allocationRunId: "run-1", data: [serviceRow] });
  });

  it("keeps the submit button disabled until a period, a service, and at least one hypothetical value are set", async () => {
    renderComponent();
    const user = userEvent.setup();

    expect(await screen.findByRole("option", { name: "2026-01" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jalankan Simulasi" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Periode"), "period-1");
    expect(await screen.findByRole("option", { name: "SVC-1 — Konsultasi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jalankan Simulasi" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Layanan"), "svc-1");
    expect(screen.getByRole("button", { name: "Jalankan Simulasi" })).toBeDisabled();

    await user.type(screen.getByLabelText("Tarif Hipotetis"), "60000");
    expect(screen.getByRole("button", { name: "Jalankan Simulasi" })).toBeEnabled();
  });

  it("submits the hypothetical inputs and renders the not-saved label plus baseline/hypothetical figures on success", async () => {
    mockedWhatIfApi.simulate.mockResolvedValue(simulationResult());
    renderComponent();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");
    await user.selectOptions(await screen.findByLabelText("Layanan"), "svc-1");
    await user.type(screen.getByLabelText("Tarif Hipotetis"), "60000");
    await user.type(screen.getByLabelText("Volume Hipotetis"), "150");
    await user.click(screen.getByRole("button", { name: "Jalankan Simulasi" }));

    await waitFor(() =>
      expect(mockedWhatIfApi.simulate).toHaveBeenCalledWith({
        periodId: "period-1",
        serviceId: "svc-1",
        hypotheticalTariff: 60000,
        hypotheticalVolume: 150,
      })
    );

    expect(await screen.findByText(/Simulasi — Tidak Disimpan/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SVC-1 — Konsultasi" })).toBeInTheDocument();
    expect(screen.getByText("Dampak ke Profit Center: Poli Umum")).toBeInTheDocument();
  });

  it("shows the API's error message and no result panel when the simulation call fails", async () => {
    mockedWhatIfApi.simulate.mockRejectedValue(
      new ApiRequestError(422, { code: "WHAT_IF_NO_HYPOTHETICAL_INPUT", message: "Provide at least one hypothetical value.", traceId: "t1" })
    );
    renderComponent();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");
    await user.selectOptions(await screen.findByLabelText("Layanan"), "svc-1");
    await user.type(screen.getByLabelText("Volume Hipotetis"), "150");
    await user.click(screen.getByRole("button", { name: "Jalankan Simulasi" }));

    expect(await screen.findByText("Provide at least one hypothetical value.")).toBeInTheDocument();
    expect(screen.queryByText(/Simulasi — Tidak Disimpan/)).not.toBeInTheDocument();
  });

  it("shows an explanatory message and disables the service selector when no completed allocation run exists for the period", async () => {
    mockedProfitabilityApi.services.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run.", traceId: "t1" })
    );
    renderComponent();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Periode"), "period-1");

    expect(await screen.findByText(/Belum ada perhitungan Cost Allocation/)).toBeInTheDocument();
    expect(screen.getByLabelText("Layanan")).toBeDisabled();
  });
});
