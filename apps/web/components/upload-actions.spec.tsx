import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmAction, RollbackAction } from "./upload-actions";
import { uploadsApi } from "../lib/uploads-api";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/uploads-api", () => ({ uploadsApi: { confirm: vi.fn(), rollback: vi.fn() } }));

const mockedUploadsApi = vi.mocked(uploadsApi);

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ConfirmAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms immediately (no acknowledgment needed) when there are no warnings", async () => {
    mockedUploadsApi.confirm.mockResolvedValue({} as never);
    const user = userEvent.setup();

    renderWithQueryClient(<ConfirmAction batchId="batch-1" hasWarnings={false} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Konfirmasi Upload" }));

    await waitFor(() => expect(mockedUploadsApi.confirm).toHaveBeenCalledWith("batch-1", undefined));
  });

  it("keeps the confirm button disabled until the warning checkbox is checked, then sends acknowledged: true", async () => {
    mockedUploadsApi.confirm.mockResolvedValue({} as never);
    const user = userEvent.setup();

    renderWithQueryClient(<ConfirmAction batchId="batch-1" hasWarnings />);
    expect(screen.getByRole("button", { name: "Konfirmasi Upload" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Konfirmasi Upload" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Konfirmasi Upload" }));

    await waitFor(() => expect(mockedUploadsApi.confirm).toHaveBeenCalledWith("batch-1", true));
  });

  it("shows the API's error message on failure", async () => {
    mockedUploadsApi.confirm.mockRejectedValue(
      new ApiRequestError(409, { code: "UPLOAD_NOT_CONFIRMABLE", message: "Upload batch is 'confirmed', not 'validated'.", traceId: "t1" })
    );
    const user = userEvent.setup();

    renderWithQueryClient(<ConfirmAction batchId="batch-1" hasWarnings={false} />);
    await user.click(screen.getByRole("button", { name: "Konfirmasi Upload" }));

    expect(await screen.findByText("Upload batch is 'confirmed', not 'validated'.")).toBeInTheDocument();
  });
});

describe("RollbackAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a second click to actually roll back, warning about the allocation-run cascade first", async () => {
    mockedUploadsApi.rollback.mockResolvedValue({} as never);
    const user = userEvent.setup();

    renderWithQueryClient(<RollbackAction batchId="batch-1" />);
    expect(mockedUploadsApi.rollback).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Rollback" }));
    expect(screen.getByText(/menandai semua allocation run/)).toBeInTheDocument();
    expect(mockedUploadsApi.rollback).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ya, Rollback" }));

    await waitFor(() => expect(mockedUploadsApi.rollback).toHaveBeenCalledWith("batch-1"));
  });

  it("'Batal' cancels without calling the API", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<RollbackAction batchId="batch-1" />);
    await user.click(screen.getByRole("button", { name: "Rollback" }));
    await user.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.getByRole("button", { name: "Rollback" })).toBeInTheDocument();
    expect(mockedUploadsApi.rollback).not.toHaveBeenCalled();
  });
});
