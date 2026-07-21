import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CostAllocation } from "./cost-allocation";
import { allocationRunsApi } from "../lib/allocation-runs-api";
import { periodsApi } from "../lib/periods-api";
import { useAuth } from "../lib/auth-context";
import { costCentersApi } from "../lib/cost-centers-api";
import { profitCentersApi } from "../lib/profit-centers-api";
import { driversApi } from "../lib/drivers-api";

vi.mock("../lib/allocation-runs-api", () => ({
  allocationRunsApi: { list: vi.fn(), create: vi.fn(), get: vi.fn(), getAllocatedCosts: vi.fn(), recalculate: vi.fn() },
}));
vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));
vi.mock("../lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/cost-centers-api", () => ({ costCentersApi: { list: vi.fn() } }));
vi.mock("../lib/profit-centers-api", () => ({ profitCentersApi: { list: vi.fn() } }));
vi.mock("../lib/drivers-api", () => ({ driversApi: { list: vi.fn() } }));

const mockedAllocationRunsApi = vi.mocked(allocationRunsApi);
const mockedPeriodsApi = vi.mocked(periodsApi);
const mockedUseAuth = vi.mocked(useAuth);
const mockedCostCentersApi = vi.mocked(costCentersApi);
const mockedProfitCentersApi = vi.mocked(profitCentersApi);
const mockedDriversApi = vi.mocked(driversApi);

function mockAuth(permissions: string[]) {
  mockedUseAuth.mockReturnValue({
    status: "authenticated",
    user: {
      id: "u1",
      name: "Test User",
      email: "u@example.test",
      status: "active",
      organization: { id: "org-1", name: "Org" },
      hospital: null,
      role: null,
      permissions,
    },
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const period = { id: "period-1", hospitalId: "h1", label: "2026-01", startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-01T00:00:00Z", status: "open" as const, createdAt: "", updatedAt: "" };

function run(overrides: {
  id?: string;
  status?: "draft" | "running" | "completed" | "completed_with_errors" | "failed";
  method?: "direct" | "step_down";
  warnings?: { code: string; costCenterId: string; driverId: string }[] | null;
  isStale?: boolean;
} = {}) {
  return {
    id: overrides.id ?? "run-1",
    hospitalId: "h1",
    periodId: period.id,
    method: overrides.method ?? "step_down",
    status: overrides.status ?? "completed",
    startedAt: "2026-01-15T08:00:00.000Z",
    finishedAt: "2026-01-15T08:05:00.000Z",
    errorMessage: null,
    warnings: overrides.warnings ?? null,
    isStale: overrides.isStale ?? false,
    staleAt: null,
    supersedesRunId: null,
    createdByUserId: "u1",
    createdAt: "2026-01-15T08:00:00.000Z",
  };
}

function renderWithQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CostAllocation />
    </QueryClientProvider>
  );
}

describe("CostAllocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriodsApi.list.mockResolvedValue({ data: [period], meta: { page: 1, limit: 100, total: 1 } });
    mockAuth(["cost_allocation.read", "cost_allocation.write"]);
    mockedCostCentersApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });
    mockedProfitCentersApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });
    mockedDriversApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });
  });

  it("shows an empty state when no runs exist yet", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });

    renderWithQueryClient();

    expect(await screen.findByText("Perhitungan belum dijalankan")).toBeInTheDocument();
  });

  it("shows an error state with retry on failure", async () => {
    mockedAllocationRunsApi.list.mockRejectedValue(new Error("boom"));

    renderWithQueryClient();

    expect(await screen.findByText("Gagal memuat riwayat alokasi.")).toBeInTheDocument();
  });

  it("renders a run row with human-readable period, method, and status", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [run()], meta: { page: 1, limit: 20, total: 1 } });

    renderWithQueryClient();

    expect(await screen.findByText("2026-01")).toBeInTheDocument();
    expect(screen.getByText("Step-Down")).toBeInTheDocument();
    expect(screen.getByText("Selesai")).toBeInTheDocument();
  });

  it("shows the warning count and isStale flag", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({
      data: [
        run({
          warnings: [
            { code: "W_DRIVER_ZERO", costCenterId: "cc-1", driverId: "drv-1" },
            { code: "W_DRIVER_ZERO", costCenterId: "cc-2", driverId: "drv-1" },
          ],
          isStale: true,
        }),
      ],
      meta: { page: 1, limit: 20, total: 1 },
    });

    renderWithQueryClient();

    await screen.findByText("2026-01");
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Ya")).toBeInTheDocument();
  });

  it("shows a distinct badge for a failed run", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({
      data: [run({ status: "failed" })],
      meta: { page: 1, limit: 20, total: 1 },
    });

    renderWithQueryClient();

    expect(await screen.findByText("Gagal")).toBeInTheDocument();
  });

  it("paginates: 'Berikutnya' fetches the next page", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [run()], meta: { page: 1, limit: 20, total: 25 } });
    const user = userEvent.setup();

    renderWithQueryClient();
    expect(await screen.findByText("Halaman 1 dari 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Berikutnya" }));

    expect(mockedAllocationRunsApi.list).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it("hides the 'Jalankan Alokasi' affordance for a user without cost_allocation.write", async () => {
    mockAuth(["cost_allocation.read"]);
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [run()], meta: { page: 1, limit: 20, total: 1 } });

    renderWithQueryClient();

    await screen.findByText("2026-01");
    expect(screen.queryByRole("button", { name: "Jalankan Alokasi" })).not.toBeInTheDocument();
  });

  it("opens the trigger form from the header button, submits it, and refreshes the list on success", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [run()], meta: { page: 1, limit: 20, total: 1 } });
    mockedAllocationRunsApi.create.mockResolvedValue(run({ id: "run-2", status: "draft" }));
    const user = userEvent.setup();

    renderWithQueryClient();
    await screen.findByText("2026-01");

    await user.click(screen.getByRole("button", { name: "Jalankan Alokasi" }));
    await user.selectOptions(screen.getByLabelText("Periode"), "period-1");
    await user.selectOptions(screen.getByLabelText("Metode"), "direct");
    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    await waitFor(() => expect(mockedAllocationRunsApi.create).toHaveBeenCalledWith("period-1", "direct"));
    await waitFor(() => expect(mockedAllocationRunsApi.list).toHaveBeenCalledWith({ page: 1, limit: 20 }));
    expect(screen.queryByLabelText("Metode")).not.toBeInTheDocument();
  });

  it("shows the trigger form's own CTA (not the header's) on the empty state", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });

    renderWithQueryClient();

    expect(await screen.findByText("Perhitungan belum dijalankan")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Jalankan Alokasi" })).toHaveLength(1);
  });

  it("shows the run detail (polled status) when a row is clicked, and hides it again on a second click", async () => {
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [run()], meta: { page: 1, limit: 20, total: 1 } });
    mockedAllocationRunsApi.get.mockResolvedValue(run({ status: "running" }));
    const user = userEvent.setup();

    renderWithQueryClient();
    const row = (await screen.findByText("2026-01")).closest("tr")!;

    await user.click(row);
    expect(await screen.findByText(/Menghitung alokasi/)).toBeInTheDocument();

    await user.click(row);
    await waitFor(() => expect(screen.queryByText(/Menghitung alokasi/)).not.toBeInTheDocument());
  });
});
