import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Profitability } from "./profitability";
import { periodsApi } from "../lib/periods-api";
import { allocationRunsApi } from "../lib/allocation-runs-api";

vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));
vi.mock("../lib/allocation-runs-api", () => ({ allocationRunsApi: { list: vi.fn() } }));
vi.mock("./profit-center-detail-table", () => ({
  ProfitCenterDetailTable: ({ periodId }: { periodId: string }) => <div data-testid="pc-table">pc-table:{periodId}</div>,
}));
vi.mock("./service-unit-cost-table", () => ({
  ServiceUnitCostTable: ({ periodId }: { periodId: string }) => <div data-testid="svc-table">svc-table:{periodId}</div>,
}));

const mockedPeriodsApi = vi.mocked(periodsApi);
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Profitability />
    </QueryClientProvider>
  );
}

describe("Profitability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });
  });

  it("shows an empty state when no periods exist", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0 } });

    renderPage();

    expect(await screen.findByText("Belum ada periode")).toBeInTheDocument();
  });

  it("defaults to the period with a completed non-stale run, not the chronologically latest", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });
    mockedAllocationRunsApi.list.mockResolvedValue({ data: [completedRun(periodJanuari.id)], meta: { page: 1, limit: 100, total: 1 } });

    renderPage();

    expect(await screen.findByText(`pc-table:${periodJanuari.id}`)).toBeInTheDocument();
    expect(await screen.findByText(`svc-table:${periodJanuari.id}`)).toBeInTheDocument();
    expect((screen.getByLabelText("Periode") as HTMLSelectElement).value).toBe(periodJanuari.id);
  });

  it("falls back to the most recent period overall when none has a completed run", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });

    renderPage();

    expect(await screen.findByText(`pc-table:${periodFebruari.id}`)).toBeInTheDocument();
  });

  it("ignores a stale completed run when picking the default period", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });
    mockedAllocationRunsApi.list.mockResolvedValue({
      data: [{ ...completedRun(periodJanuari.id), isStale: true }],
      meta: { page: 1, limit: 100, total: 1 },
    });

    renderPage();

    expect(await screen.findByText(`pc-table:${periodFebruari.id}`)).toBeInTheDocument();
  });

  it("re-renders both tables for the newly selected period when the user changes it", async () => {
    mockedPeriodsApi.list.mockResolvedValue({ data: [periodJanuari, periodFebruari], meta: { page: 1, limit: 100, total: 2 } });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(`pc-table:${periodFebruari.id}`);

    await user.selectOptions(screen.getByLabelText("Periode"), periodJanuari.id);

    await waitFor(() => expect(screen.getByText(`pc-table:${periodJanuari.id}`)).toBeInTheDocument());
    expect(screen.getByText(`svc-table:${periodJanuari.id}`)).toBeInTheDocument();
  });
});
