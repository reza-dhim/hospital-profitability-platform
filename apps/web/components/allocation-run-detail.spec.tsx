import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AllocationRunDetail } from "./allocation-run-detail";
import { allocationRunsApi } from "../lib/allocation-runs-api";
import { costCentersApi } from "../lib/cost-centers-api";
import { profitCentersApi } from "../lib/profit-centers-api";
import { driversApi } from "../lib/drivers-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/allocation-runs-api", () => ({
  allocationRunsApi: { get: vi.fn(), getAllocatedCosts: vi.fn(), recalculate: vi.fn() },
}));
vi.mock("../lib/cost-centers-api", () => ({ costCentersApi: { list: vi.fn() } }));
vi.mock("../lib/profit-centers-api", () => ({ profitCentersApi: { list: vi.fn() } }));
vi.mock("../lib/drivers-api", () => ({ driversApi: { list: vi.fn() } }));

const mockedAllocationRunsApi = vi.mocked(allocationRunsApi);
const mockedCostCentersApi = vi.mocked(costCentersApi);
const mockedProfitCentersApi = vi.mocked(profitCentersApi);
const mockedDriversApi = vi.mocked(driversApi);

function run(overrides: {
  status?: "draft" | "running" | "completed" | "completed_with_errors" | "failed";
  warnings?: { code: string; costCenterId: string; driverId: string }[] | null;
  errorMessage?: string | null;
} = {}) {
  return {
    id: "run-1",
    hospitalId: "h1",
    periodId: "period-1",
    method: "step_down" as const,
    status: overrides.status ?? "completed",
    startedAt: "2026-01-15T08:00:00.000Z",
    finishedAt: overrides.status === "draft" || overrides.status === "running" ? null : "2026-01-15T08:05:00.000Z",
    errorMessage: overrides.errorMessage ?? null,
    warnings: overrides.warnings ?? null,
    isStale: false,
    staleAt: null,
    supersedesRunId: null,
    createdByUserId: "u1",
    createdAt: "2026-01-15T08:00:00.000Z",
  };
}

function renderDetail(canWrite = true, onRecalculated = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AllocationRunDetail runId="run-1" canWrite={canWrite} onRecalculated={onRecalculated} />
    </QueryClientProvider>
  );
  return { onRecalculated };
}

describe("AllocationRunDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCostCentersApi.list.mockResolvedValue({
      data: [
        { id: "cc-1", hospitalId: "h1", code: "CC-01", name: "Farmasi", type: "indirect", profitCenterId: null, status: "active", createdAt: "", updatedAt: "" },
        { id: "cc-2", hospitalId: "h1", code: "CC-02", name: "Laundry", type: "indirect", profitCenterId: null, status: "active", createdAt: "", updatedAt: "" },
      ],
      meta: { page: 1, limit: 100, total: 2 },
    });
    mockedProfitCentersApi.list.mockResolvedValue({
      data: [{ id: "pc-1", hospitalId: "h1", code: "PC-01", name: "Rawat Jalan", department: null, status: "active", createdAt: "", updatedAt: "" }],
      meta: { page: 1, limit: 100, total: 1 },
    });
    mockedDriversApi.list.mockResolvedValue({
      data: [{ id: "drv-1", hospitalId: "h1", code: "DRV-01", name: "Luas Lantai", unit: "m2", description: null, createdAt: "", updatedAt: "" }],
      meta: { page: 1, limit: 100, total: 1 },
    });
  });

  it("shows a processing message and does not fetch allocated costs while still draft", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run({ status: "draft" }));

    renderDetail();

    expect(await screen.findByText(/Menunggu diproses/)).toBeInTheDocument();
    expect(mockedAllocationRunsApi.getAllocatedCosts).not.toHaveBeenCalled();
  });

  it("shows a processing message while running", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run({ status: "running" }));

    renderDetail();

    expect(await screen.findByText(/Menghitung alokasi/)).toBeInTheDocument();
    expect(mockedAllocationRunsApi.getAllocatedCosts).not.toHaveBeenCalled();
  });

  it("shows the error message and no costs table for a failed run", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run({ status: "failed", errorMessage: "Cycle detected in allocation rules." }));

    renderDetail();

    expect(await screen.findByText("Cycle detected in allocation rules.")).toBeInTheDocument();
    expect(mockedAllocationRunsApi.getAllocatedCosts).not.toHaveBeenCalled();
  });

  it("shows a human-readable warning banner for a completed run with W_DRIVER_ZERO", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(
      run({ warnings: [{ code: "W_DRIVER_ZERO", costCenterId: "cc-1", driverId: "drv-1" }] })
    );
    mockedAllocationRunsApi.getAllocatedCosts.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } });

    renderDetail();

    expect(await screen.findByText(/Nilai driver nol/)).toBeInTheDocument();
  });

  it("renders the allocated-costs table with names resolved from the lookup APIs", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run());
    mockedAllocationRunsApi.getAllocatedCosts.mockResolvedValue({
      data: [
        {
          id: "cost-1",
          allocationRunId: "run-1",
          sourceCostCenterId: "cc-1",
          targetCostCenterId: "cc-2",
          targetProfitCenterId: null,
          driverId: "drv-1",
          amount: "1500000.00",
          createdAt: "2026-01-15T08:05:00.000Z",
        },
        {
          id: "cost-2",
          allocationRunId: "run-1",
          sourceCostCenterId: "cc-2",
          targetCostCenterId: null,
          targetProfitCenterId: "pc-1",
          driverId: "drv-1",
          amount: "2500000.00",
          createdAt: "2026-01-15T08:05:00.000Z",
        },
      ],
      meta: { page: 1, limit: 50, total: 2 },
    });

    renderDetail();

    expect(await screen.findByText("CC-01 — Farmasi")).toBeInTheDocument();
    expect(screen.getAllByText("CC-02 — Laundry")).toHaveLength(2);
    expect(screen.getByText("PC-01 — Rawat Jalan")).toBeInTheDocument();
    expect(screen.getAllByText("Luas Lantai")).toHaveLength(2);
    expect(screen.getByText(/Rp\s?1\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?2\.500\.000/)).toBeInTheDocument();
  });

  it("paginates the allocated-costs table", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run());
    mockedAllocationRunsApi.getAllocatedCosts.mockResolvedValue({
      data: [
        { id: "cost-1", allocationRunId: "run-1", sourceCostCenterId: "cc-1", targetCostCenterId: "cc-2", targetProfitCenterId: null, driverId: "drv-1", amount: "100.00", createdAt: "2026-01-15T08:05:00.000Z" },
      ],
      meta: { page: 1, limit: 50, total: 60 },
    });
    const user = userEvent.setup();

    renderDetail();
    expect(await screen.findByText("Halaman 1 dari 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Berikutnya" }));

    await waitFor(() => expect(mockedAllocationRunsApi.getAllocatedCosts).toHaveBeenCalledWith("run-1", { page: 2, limit: 50 }));
  });

  it("shows an error state with retry when the run fetch fails", async () => {
    mockedAllocationRunsApi.get.mockRejectedValue(new Error("boom"));

    renderDetail();

    expect(await screen.findByText("Gagal memuat detail alokasi.")).toBeInTheDocument();
  });

  it("hides 'Hitung Ulang' for a read-only user (no cost_allocation.write)", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run());
    mockedAllocationRunsApi.getAllocatedCosts.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } });

    renderDetail(false);

    await screen.findByText("Detail Perhitungan Alokasi");
    expect(screen.queryByRole("button", { name: "Hitung Ulang" })).not.toBeInTheDocument();
  });

  it("hides 'Hitung Ulang' while the run is still draft/running (not settled)", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run({ status: "running" }));

    renderDetail(true);

    await screen.findByText(/Menghitung alokasi/);
    expect(screen.queryByRole("button", { name: "Hitung Ulang" })).not.toBeInTheDocument();
  });

  it("shows 'Hitung Ulang' for a failed (settled) run when the user can write", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run({ status: "failed", errorMessage: "Cycle detected." }));

    renderDetail(true);

    expect(await screen.findByRole("button", { name: "Hitung Ulang" })).toBeInTheDocument();
  });

  it("recalculates on click, invalidating the run list and selecting the new run", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run());
    mockedAllocationRunsApi.getAllocatedCosts.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } });
    mockedAllocationRunsApi.recalculate.mockResolvedValue({ ...run(), id: "run-2", supersedesRunId: "run-1" });
    const user = userEvent.setup();

    const { onRecalculated } = renderDetail(true);
    await user.click(await screen.findByRole("button", { name: "Hitung Ulang" }));

    await waitFor(() => expect(mockedAllocationRunsApi.recalculate).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(onRecalculated).toHaveBeenCalledWith("run-2"));
  });

  it("shows the API's error message and does not call onRecalculated when recalculate fails", async () => {
    mockedAllocationRunsApi.get.mockResolvedValue(run());
    mockedAllocationRunsApi.getAllocatedCosts.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } });
    mockedAllocationRunsApi.recalculate.mockRejectedValue(
      new ApiRequestError(409, {
        code: "ALREADY_SUPERSEDED",
        message: "This allocation run has already been superseded by a later recalculation — recalculate the latest run instead.",
        traceId: "t1",
      })
    );
    const user = userEvent.setup();

    const { onRecalculated } = renderDetail(true);
    await user.click(await screen.findByRole("button", { name: "Hitung Ulang" }));

    expect(await screen.findByText(/already been superseded/)).toBeInTheDocument();
    expect(onRecalculated).not.toHaveBeenCalled();
  });
});
