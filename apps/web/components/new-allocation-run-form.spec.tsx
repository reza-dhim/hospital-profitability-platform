import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewAllocationRunForm } from "./new-allocation-run-form";
import { allocationRunsApi } from "../lib/allocation-runs-api";
import { periodsApi } from "../lib/periods-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/allocation-runs-api", () => ({ allocationRunsApi: { create: vi.fn() } }));
vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));

const mockedAllocationRunsApi = vi.mocked(allocationRunsApi);
const mockedPeriodsApi = vi.mocked(periodsApi);

const openPeriod = { id: "period-open", hospitalId: "h1", label: "2026-01", startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-01T00:00:00Z", status: "open" as const, createdAt: "", updatedAt: "" };
const lockedPeriod = { id: "period-locked", hospitalId: "h1", label: "2025-12", startDate: "2025-12-01T00:00:00Z", endDate: "2026-01-01T00:00:00Z", status: "locked" as const, createdAt: "", updatedAt: "" };

function renderForm(onCreated = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NewAllocationRunForm onCreated={onCreated} />
    </QueryClientProvider>
  );
  return { onCreated };
}

function run() {
  return {
    id: "run-1",
    hospitalId: "h1",
    periodId: openPeriod.id,
    method: "direct" as const,
    status: "draft" as const,
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    warnings: null,
    isStale: false,
    staleAt: null,
    supersedesRunId: null,
    createdByUserId: "u1",
    createdAt: "2026-01-15T00:00:00Z",
  };
}

describe("NewAllocationRunForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriodsApi.list.mockResolvedValue({ data: [openPeriod, lockedPeriod], meta: { page: 1, limit: 100, total: 2 } });
  });

  it("only lists open periods — the endpoint 422s against a non-open period", async () => {
    renderForm();

    expect(await screen.findByRole("option", { name: "2026-01" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "2025-12" })).not.toBeInTheDocument();
  });

  it("keeps the submit button disabled until a period is chosen, defaulting method to Step-Down", async () => {
    renderForm();
    await screen.findByRole("option", { name: "2026-01" });
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Jalankan" })).toBeDisabled();
    expect((screen.getByLabelText("Metode") as HTMLSelectElement).value).toBe("step_down");

    await user.selectOptions(screen.getByLabelText("Periode"), "period-open");
    expect(screen.getByRole("button", { name: "Jalankan" })).toBeEnabled();
  });

  it("submits periodId/method to allocationRunsApi.create and calls onCreated on success", async () => {
    mockedAllocationRunsApi.create.mockResolvedValue(run());
    const { onCreated } = renderForm();
    await screen.findByRole("option", { name: "2026-01" });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Periode"), "period-open");
    await user.selectOptions(screen.getByLabelText("Metode"), "direct");
    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    await waitFor(() => expect(mockedAllocationRunsApi.create).toHaveBeenCalledWith("period-open", "direct"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("shows the API's error message and does not call onCreated when create fails", async () => {
    mockedAllocationRunsApi.create.mockRejectedValue(
      new ApiRequestError(409, { code: "RUN_ALREADY_RUNNING", message: "A run is already in progress for this period.", traceId: "t1" })
    );
    const { onCreated } = renderForm();
    await screen.findByRole("option", { name: "2026-01" });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Periode"), "period-open");
    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    expect(await screen.findByText("A run is already in progress for this period.")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
