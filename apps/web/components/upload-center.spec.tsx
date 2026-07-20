import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadCenter } from "./upload-center";
import { uploadsApi } from "../lib/uploads-api";
import { periodsApi } from "../lib/periods-api";
import { templatesApi } from "../lib/templates-api";
import { useAuth } from "../lib/auth-context";

vi.mock("../lib/uploads-api", () => ({
  uploadsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), getValidation: vi.fn(), confirm: vi.fn(), rollback: vi.fn() },
}));
vi.mock("../lib/periods-api", () => ({ periodsApi: { list: vi.fn() } }));
vi.mock("../lib/templates-api", () => ({ templatesApi: { download: vi.fn() } }));
vi.mock("../lib/download-file", () => ({ triggerBrowserDownload: vi.fn() }));
vi.mock("../lib/auth-context", () => ({ useAuth: vi.fn() }));

const mockedUploadsApi = vi.mocked(uploadsApi);
const mockedPeriodsApi = vi.mocked(periodsApi);
const mockedTemplatesApi = vi.mocked(templatesApi);
const mockedUseAuth = vi.mocked(useAuth);

const period = { id: "period-1", hospitalId: "h1", label: "2026-01", startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-01T00:00:00Z", status: "open" as const, createdAt: "", updatedAt: "" };

function batch(overrides: {
  id?: string;
  status?: "staged" | "validating" | "validated" | "confirmed" | "rolled_back" | "failed";
  rowCount?: number | null;
  errorCount?: number | null;
} = {}) {
  return {
    id: overrides.id ?? "batch-1",
    hospitalId: "h1",
    type: "cost" as const,
    periodId: period.id,
    fileName: "cost-2026-01.xlsx",
    uploadedByUserId: "u1",
    status: overrides.status ?? "confirmed",
    rowCount: overrides.rowCount === undefined ? 10 : overrides.rowCount,
    errorCount: overrides.errorCount === undefined ? 0 : overrides.errorCount,
    createdAt: "2026-01-15T08:30:00.000Z",
    confirmedAt: "2026-01-15T09:00:00.000Z",
    rolledBackAt: null,
  };
}

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

function renderWithQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UploadCenter />
    </QueryClientProvider>
  );
}

describe("UploadCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriodsApi.list.mockResolvedValue({ data: [period], meta: { page: 1, limit: 100, total: 1 } });
    mockAuth(["upload.read", "upload.write"]);
  });

  it("shows an empty state when there are no uploads yet", async () => {
    mockedUploadsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });

    renderWithQueryClient();

    expect(await screen.findByText("Belum ada data biaya")).toBeInTheDocument();
  });

  it("shows an error state with retry on failure", async () => {
    mockedUploadsApi.list.mockRejectedValue(new Error("boom"));

    renderWithQueryClient();

    expect(await screen.findByText("Gagal memuat riwayat upload.")).toBeInTheDocument();
  });

  it("renders a batch row with its human-readable period label and status", async () => {
    mockedUploadsApi.list.mockResolvedValue({ data: [batch()], meta: { page: 1, limit: 20, total: 1 } });

    renderWithQueryClient();

    expect(await screen.findByText("cost-2026-01.xlsx")).toBeInTheDocument();
    expect(screen.getByText("2026-01")).toBeInTheDocument();
    expect(screen.getByText("Terkonfirmasi")).toBeInTheDocument();
  });

  it("shows a dash for rowCount/errorCount while still null (not yet parsed)", async () => {
    mockedUploadsApi.list.mockResolvedValue({
      data: [batch({ status: "staged", rowCount: null, errorCount: null })],
      meta: { page: 1, limit: 20, total: 1 },
    });

    renderWithQueryClient();

    expect(await screen.findByText("Menunggu Parsing")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("paginates: 'Berikutnya' fetches the next page", async () => {
    mockedUploadsApi.list.mockResolvedValue({
      data: [batch({ id: "batch-1" })],
      meta: { page: 1, limit: 20, total: 25 },
    });
    const user = userEvent.setup();

    renderWithQueryClient();
    expect(await screen.findByText("Halaman 1 dari 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Berikutnya" }));

    await waitFor(() => expect(mockedUploadsApi.list).toHaveBeenCalledWith({ page: 2, limit: 20 }));
  });

  it("hides the 'Upload Baru' affordance for a user without upload.write", async () => {
    mockAuth(["upload.read"]);
    mockedUploadsApi.list.mockResolvedValue({ data: [batch()], meta: { page: 1, limit: 20, total: 1 } });

    renderWithQueryClient();

    await screen.findByText("cost-2026-01.xlsx");
    expect(screen.queryByRole("button", { name: "Upload Baru" })).not.toBeInTheDocument();
  });

  it("opens the New Upload form from the header button, and refreshes the list after a successful upload", async () => {
    mockedUploadsApi.list.mockResolvedValue({ data: [batch()], meta: { page: 1, limit: 20, total: 1 } });
    mockedUploadsApi.create.mockResolvedValue(batch({ id: "batch-2", status: "staged", rowCount: null, errorCount: null }));
    const user = userEvent.setup();

    renderWithQueryClient();
    await screen.findByText("cost-2026-01.xlsx");

    await user.click(screen.getByRole("button", { name: "Upload Baru" }));
    expect(screen.getByText("Tipe Data")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Periode"), "period-1");
    const file = new File(["data"], "cost.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(screen.getByLabelText("Pilih file untuk diunggah"), file);
    await user.click(screen.getByRole("button", { name: "Unggah" }));

    await waitFor(() => expect(mockedUploadsApi.create).toHaveBeenCalledWith("cost", "period-1", file));
    await waitFor(() => expect(mockedUploadsApi.list).toHaveBeenCalledWith({ page: 1, limit: 20 }));
    expect(screen.queryByText("Tipe Data")).not.toBeInTheDocument();
  });

  it("downloads the template for the selected type via an authenticated fetch, not a plain link", async () => {
    mockedUploadsApi.list.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    mockedTemplatesApi.download.mockResolvedValue({ blob: new Blob(["x"]), fileName: "cost-template.xlsx" });
    const user = userEvent.setup();

    renderWithQueryClient();
    await screen.findByText("Belum ada data biaya");
    await user.click(screen.getByRole("button", { name: "Upload Baru" }));
    await user.click(screen.getByText("Download template Biaya"));

    await waitFor(() => expect(mockedTemplatesApi.download).toHaveBeenCalledWith("cost"));
  });

  it("shows the batch detail (polled status) when a row is clicked, and hides it again on a second click", async () => {
    mockedUploadsApi.list.mockResolvedValue({ data: [batch()], meta: { page: 1, limit: 20, total: 1 } });
    mockedUploadsApi.get.mockResolvedValue(batch({ status: "staged", rowCount: null, errorCount: null }));
    const user = userEvent.setup();

    renderWithQueryClient();
    const row = (await screen.findByText("cost-2026-01.xlsx")).closest("tr")!;

    await user.click(row);
    expect(await screen.findByText(/Menunggu diproses/)).toBeInTheDocument();

    await user.click(row);
    await waitFor(() => expect(screen.queryByText(/Menunggu diproses/)).not.toBeInTheDocument());
  });
});
