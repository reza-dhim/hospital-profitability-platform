import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DoctorAnalyticsSummaryTable } from "./doctor-analytics-summary-table";
import { doctorAnalyticsApi } from "../lib/doctor-analytics-api";
import { doctorMasterDataApi } from "../lib/doctors-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/doctor-analytics-api", () => ({
  doctorAnalyticsApi: { summary: vi.fn(), comparison: vi.fn() },
  isIdentifiedComparison: (c: unknown) => c !== null && typeof c === "object" && "doctorId" in c,
}));
vi.mock("../lib/doctors-api", () => ({
  doctorMasterDataApi: { list: vi.fn() },
}));

const mockedDoctorAnalyticsApi = vi.mocked(doctorAnalyticsApi);
const mockedDoctorMasterDataApi = vi.mocked(doctorMasterDataApi);

function summaryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    serviceId: "svc-1",
    serviceCode: "SVC-001",
    serviceName: "Konsultasi",
    doctorCount: 2,
    totalRevenue: "5000000.00",
    totalCost: "4700000.00",
    totalProfit: "300000.00",
    overallMargin: "6.0000",
    cohort: { median: "235416.6667", p25: "234375.0000", p75: "236458.3333", p90: "237083.3333", doctorCount: 2 },
    doctorsAboveP90Count: 1,
    doctorsBelowP25Count: 1,
    insufficientSampleDoctorCount: 0,
    ...overrides,
  };
}

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DoctorAnalyticsSummaryTable periodId="period-1" />
    </QueryClientProvider>
  );
}

describe("DoctorAnalyticsSummaryTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDoctorMasterDataApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });
  });

  it("shows the 'not yet run' empty state on a NO_COMPLETED_ALLOCATION_RUN 404", async () => {
    mockedDoctorAnalyticsApi.summary.mockRejectedValue(
      new ApiRequestError(404, { code: "NO_COMPLETED_ALLOCATION_RUN", message: "No completed run.", traceId: "t1" })
    );

    renderTable();

    expect(await screen.findByText("Perhitungan belum dijalankan")).toBeInTheDocument();
  });

  it("shows a generic error state for any other failure", async () => {
    mockedDoctorAnalyticsApi.summary.mockRejectedValue(new ApiRequestError(500, { code: "INTERNAL", message: "Boom.", traceId: "t1" }));

    renderTable();

    expect(await screen.findByText("Gagal memuat ringkasan performa dokter.")).toBeInTheDocument();
  });

  it("shows an empty state when there is no medical_activities data yet", async () => {
    mockedDoctorAnalyticsApi.summary.mockResolvedValue({ allocationRunId: "run-1", periodId: "period-1", data: [] });

    renderTable();

    expect(await screen.findByText("Belum ada data aktivitas medis")).toBeInTheDocument();
  });

  it("renders a service row with formatted revenue/cost/profit/margin, and never shows a doctor name at this grain", async () => {
    mockedDoctorAnalyticsApi.summary.mockResolvedValue({ allocationRunId: "run-1", periodId: "period-1", data: [summaryRow()] });

    renderTable();

    expect(await screen.findByText(/SVC-001/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?5\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText("6.0%")).toBeInTheDocument();
    expect(screen.queryByText(/dr\./i)).not.toBeInTheDocument();
  });

  it("opens the comparison panel for a service when 'Lihat Detail' is clicked", async () => {
    mockedDoctorAnalyticsApi.summary.mockResolvedValue({ allocationRunId: "run-1", periodId: "period-1", data: [summaryRow()] });
    mockedDoctorAnalyticsApi.comparison.mockResolvedValue({
      serviceId: "svc-1",
      serviceCode: "SVC-001",
      serviceName: "Konsultasi",
      allocationRunId: "run-1",
      periodId: "period-1",
      cohort: { median: "235416.6667", p25: "234375.0000", p75: "236458.3333", p90: "237083.3333", doctorCount: 2 },
      bands: [
        { band: "below_p25", doctorCount: 1 },
        { band: "p25_p75", doctorCount: 0 },
        { band: "p75_p90", doctorCount: 0 },
        { band: "above_p90", doctorCount: 1 },
      ],
      insufficientDataDoctorCount: 0,
    });

    renderTable();
    await screen.findByText(/SVC-001/);

    await userEvent.click(screen.getByText("Lihat Detail"));

    expect(await screen.findByText(/Variasi Biaya per Dokter/)).toBeInTheDocument();
  });
});
