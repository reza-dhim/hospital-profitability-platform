import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewUploadForm } from "./new-upload-form";
import { uploadsApi } from "../lib/uploads-api";
import { periodsApi } from "../lib/periods-api";
import { templatesApi } from "../lib/templates-api";
import { triggerBrowserDownload } from "../lib/download-file";
import { ApiRequestError } from "../lib/api-client";

vi.mock("../lib/uploads-api", () => ({ uploadsApi: { create: vi.fn() } }));
vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));
vi.mock("../lib/templates-api", () => ({ templatesApi: { download: vi.fn() } }));
vi.mock("../lib/download-file", () => ({ triggerBrowserDownload: vi.fn() }));

const mockedUploadsApi = vi.mocked(uploadsApi);
const mockedPeriodsApi = vi.mocked(periodsApi);
const mockedTemplatesApi = vi.mocked(templatesApi);
const mockedTriggerDownload = vi.mocked(triggerBrowserDownload);

const openPeriod = { id: "period-open", hospitalId: "h1", label: "2026-01", startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-01T00:00:00Z", status: "open" as const, createdAt: "", updatedAt: "" };
const lockedPeriod = { id: "period-locked", hospitalId: "h1", label: "2025-12", startDate: "2025-12-01T00:00:00Z", endDate: "2026-01-01T00:00:00Z", status: "locked" as const, createdAt: "", updatedAt: "" };

function renderForm(onCreated = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NewUploadForm onCreated={onCreated} />
    </QueryClientProvider>
  );
  return { onCreated };
}

function makeFile() {
  return new File(["data"], "cost.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("NewUploadForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriodsApi.list.mockResolvedValue({ data: [openPeriod, lockedPeriod], meta: { page: 1, limit: 100, total: 2 } });
  });

  it("only lists open periods — intake 422s against a non-open period", async () => {
    renderForm();

    expect(await screen.findByRole("option", { name: "2026-01" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "2025-12" })).not.toBeInTheDocument();
  });

  it("keeps the submit button disabled until both a period and a file are chosen", async () => {
    renderForm();
    await screen.findByRole("option", { name: "2026-01" });
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Unggah" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Periode"), "period-open");
    expect(screen.getByRole("button", { name: "Unggah" })).toBeDisabled();

    await user.upload(screen.getByLabelText("Pilih file untuk diunggah"), makeFile());
    expect(screen.getByRole("button", { name: "Unggah" })).toBeEnabled();
  });

  it("submits type/periodId/file to uploadsApi.create and calls onCreated on success", async () => {
    mockedUploadsApi.create.mockResolvedValue({
      id: "batch-1",
      hospitalId: "h1",
      type: "cost",
      periodId: openPeriod.id,
      fileName: "cost.xlsx",
      uploadedByUserId: "u1",
      status: "staged",
      rowCount: null,
      errorCount: null,
      createdAt: "2026-01-15T00:00:00Z",
      confirmedAt: null,
      rolledBackAt: null,
    });
    const { onCreated } = renderForm();
    await screen.findByRole("option", { name: "2026-01" });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Tipe Data"), "revenue");
    await user.selectOptions(screen.getByLabelText("Periode"), "period-open");
    const file = makeFile();
    await user.upload(screen.getByLabelText("Pilih file untuk diunggah"), file);
    await user.click(screen.getByRole("button", { name: "Unggah" }));

    await waitFor(() => expect(mockedUploadsApi.create).toHaveBeenCalledWith("revenue", "period-open", file));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("shows the API's error message and does not call onCreated when create fails", async () => {
    mockedUploadsApi.create.mockRejectedValue(
      new ApiRequestError(422, { code: "PERIOD_NOT_OPEN", message: "Period is locked.", traceId: "t1" })
    );
    const { onCreated } = renderForm();
    await screen.findByRole("option", { name: "2026-01" });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Periode"), "period-open");
    await user.upload(screen.getByLabelText("Pilih file untuk diunggah"), makeFile());
    await user.click(screen.getByRole("button", { name: "Unggah" }));

    expect(await screen.findByText("Period is locked.")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("downloads the template matching the currently selected type", async () => {
    mockedTemplatesApi.download.mockResolvedValue({ blob: new Blob(["x"]), fileName: "driver-template.xlsx" });
    renderForm();
    await screen.findByRole("option", { name: "2026-01" });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Tipe Data"), "driver");
    await user.click(screen.getByText("Download template Driver Alokasi"));

    await waitFor(() => expect(mockedTemplatesApi.download).toHaveBeenCalledWith("driver"));
    await waitFor(() =>
      expect(mockedTriggerDownload).toHaveBeenCalledWith(expect.any(Blob), "driver-template.xlsx")
    );
  });
});
