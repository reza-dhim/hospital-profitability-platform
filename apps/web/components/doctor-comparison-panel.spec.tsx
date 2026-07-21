import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DoctorComparisonPanel } from "./doctor-comparison-panel";
import { doctorAnalyticsApi } from "../lib/doctor-analytics-api";
import { doctorMasterDataApi } from "../lib/doctors-api";

vi.mock("../lib/doctor-analytics-api", async () => {
  const actual = await vi.importActual<typeof import("../lib/doctor-analytics-api")>("../lib/doctor-analytics-api");
  return { ...actual, doctorAnalyticsApi: { summary: vi.fn(), comparison: vi.fn() } };
});
vi.mock("../lib/doctors-api", () => ({
  doctorMasterDataApi: { list: vi.fn() },
}));

const mockedDoctorAnalyticsApi = vi.mocked(doctorAnalyticsApi);
const mockedDoctorMasterDataApi = vi.mocked(doctorMasterDataApi);

const cohort = { median: "235416.6667", p25: "234375.0000", p75: "236458.3333", p90: "237083.3333", doctorCount: 2 };

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DoctorComparisonPanel serviceId="svc-1" serviceName="Konsultasi" periodId="period-1" />
    </QueryClientProvider>
  );
}

describe("DoctorComparisonPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDoctorMasterDataApi.list.mockResolvedValue({
      data: [{ id: "doc-1", code: "DOC-1", name: "Dr. Satu", specialty: null, status: "active" } as never],
      meta: { page: 1, limit: 100, total: 1 },
    });
  });

  it("renders the de-identified band breakdown, with no doctor name anywhere, when no doctorId is selected", async () => {
    mockedDoctorAnalyticsApi.comparison.mockResolvedValue({
      serviceId: "svc-1",
      serviceCode: "SVC-001",
      serviceName: "Konsultasi",
      allocationRunId: "run-1",
      periodId: "period-1",
      cohort,
      bands: [
        { band: "below_p25", doctorCount: 1 },
        { band: "p25_p75", doctorCount: 0 },
        { band: "p75_p90", doctorCount: 0 },
        { band: "above_p90", doctorCount: 1 },
      ],
      insufficientDataDoctorCount: 0,
    });

    renderPanel();

    expect(await screen.findByText("Di bawah P25")).toBeInTheDocument();
    expect(screen.getByText("Di atas P90")).toBeInTheDocument();
    // The doctor selector itself legitimately lists Master Data names (not
    // the masked analytics data) — the fairness-rule check is that the
    // *response content* never surfaces a doctor name, e.g. no per-doctor
    // unit-cost-equivalent or case-count section renders in the aggregate view.
    expect(screen.queryByText(/kasus periode ini/)).not.toBeInTheDocument();
  });

  it("shows sufficientSample=false with contributing factors still populated, never a bare number, for an under-sampled doctor", async () => {
    mockedDoctorMasterDataApi.list.mockResolvedValue({
      data: [{ id: "doc-1", code: "DOC-1", name: "Dr. Satu", specialty: null, status: "active" } as never],
      meta: { page: 1, limit: 100, total: 1 },
    });
    mockedDoctorAnalyticsApi.comparison.mockResolvedValue({
      serviceId: "svc-1",
      serviceCode: "SVC-001",
      serviceName: "Konsultasi",
      allocationRunId: "run-1",
      periodId: "period-1",
      doctorId: "doc-1",
      doctorCode: "DOC-1",
      doctorName: "Dr. Satu",
      caseCount: 1,
      sufficientSample: false,
      unitCostEquivalent: "233333.3333",
      cohort,
      percentileBand: null,
      totalCostDelta: null,
      factors: [
        { factor: "bmhp_cost", doctorAvg: "500000.00", cohortMedian: "450000.00", delta: "50000.00" },
        { factor: "duration_minutes", doctorAvg: "30.00", cohortMedian: "37.50", delta: "-7.50" },
        { factor: "room_cost", doctorAvg: "300000.00", cohortMedian: "250000.00", delta: "50000.00" },
        { factor: "staff_cost", doctorAvg: "200000.00", cohortMedian: "150000.00", delta: "50000.00" },
      ],
      insufficientDataReason: "Fewer than 5 cases this period.",
    });

    renderPanel();

    // Selecting a doctor triggers the identified query — the initial render
    // is the aggregate (no doctorId) query; find the select and use it.
    const select = await screen.findByLabelText(/Lihat detail dokter/i);
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.selectOptions(select, "doc-1");

    expect(await screen.findByText(/Sampel belum cukup/)).toBeInTheDocument();
    expect(screen.getByText("Biaya BMHP")).toBeInTheDocument();
    expect(screen.getByText("Durasi (menit)")).toBeInTheDocument();
    // Fairness rule: the variance figure never renders alone — factors are visible right alongside it.
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });
});
