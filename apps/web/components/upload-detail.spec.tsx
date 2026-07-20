import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadDetail } from "./upload-detail";
import { uploadsApi } from "../lib/uploads-api";
import { useAuth } from "../lib/auth-context";

vi.mock("../lib/uploads-api", () => ({
  uploadsApi: { get: vi.fn(), getValidation: vi.fn(), confirm: vi.fn(), rollback: vi.fn() },
}));
vi.mock("../lib/auth-context", () => ({ useAuth: vi.fn() }));

const mockedUploadsApi = vi.mocked(uploadsApi);
const mockedUseAuth = vi.mocked(useAuth);

function batch(status: "staged" | "validating" | "validated" | "confirmed" | "rolled_back" | "failed") {
  return {
    id: "batch-1",
    hospitalId: "h1",
    type: "cost" as const,
    periodId: "period-1",
    fileName: "cost-2026-01.xlsx",
    uploadedByUserId: "u1",
    status,
    rowCount: status === "staged" ? null : 10,
    errorCount: status === "staged" ? null : 1,
    createdAt: "2026-01-15T08:30:00.000Z",
    confirmedAt: null,
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

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UploadDetail batchId="batch-1" />
    </QueryClientProvider>
  );
}

const emptyValidation = (status: "validated" | "failed" | "confirmed") => ({
  uploadBatchId: "batch-1",
  status,
  summary: { totalRows: 10, validRows: 10, errorRows: 0, warningRows: 0 },
  errors: [],
  meta: { page: 1, limit: 50, total: 0 },
});

describe("UploadDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(["upload.read", "upload.write"]);
  });

  it("shows a processing message and no validation table while still staged", async () => {
    mockedUploadsApi.get.mockResolvedValue(batch("staged"));

    renderDetail();

    expect(await screen.findByText(/Menunggu diproses/)).toBeInTheDocument();
    expect(mockedUploadsApi.getValidation).not.toHaveBeenCalled();
  });

  it("shows a processing message while validating", async () => {
    mockedUploadsApi.get.mockResolvedValue(batch("validating"));

    renderDetail();

    expect(await screen.findByText(/Memvalidasi/)).toBeInTheDocument();
    expect(mockedUploadsApi.getValidation).not.toHaveBeenCalled();
  });

  it("fetches and renders the validation result once the batch is validated", async () => {
    mockedUploadsApi.get.mockResolvedValue(batch("validated"));
    mockedUploadsApi.getValidation.mockResolvedValue({
      uploadBatchId: "batch-1",
      status: "validated",
      summary: { totalRows: 10, validRows: 9, errorRows: 1, warningRows: 0 },
      errors: [{ rowNumber: 5, column: "cost_center_code", code: "E_INVALID_COST_CENTER", severity: "error", message: "Cost center 'CC-099' not found." }],
      meta: { page: 1, limit: 50, total: 1 },
    });

    renderDetail();

    expect(await screen.findByText("Cost center 'CC-099' not found.")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("fetches validation for a failed batch too (structural errors)", async () => {
    mockedUploadsApi.get.mockResolvedValue(batch("failed"));
    mockedUploadsApi.getValidation.mockResolvedValue({
      uploadBatchId: "batch-1",
      status: "failed",
      summary: { totalRows: 0, validRows: 0, errorRows: 1, warningRows: 0 },
      errors: [{ rowNumber: null, column: null, code: "E_TEMPLATE_VERSION", severity: "error", message: "Template is outdated." }],
      meta: { page: 1, limit: 50, total: 1 },
    });

    renderDetail();

    expect(await screen.findByText("Template is outdated.")).toBeInTheDocument();
  });

  it("shows an error state with retry when the batch fetch fails", async () => {
    mockedUploadsApi.get.mockRejectedValue(new Error("boom"));

    renderDetail();

    expect(await screen.findByText("Gagal memuat detail upload.")).toBeInTheDocument();
  });

  it("paginates the validation error table", async () => {
    mockedUploadsApi.get.mockResolvedValue(batch("validated"));
    mockedUploadsApi.getValidation.mockResolvedValue({
      uploadBatchId: "batch-1",
      status: "validated",
      summary: { totalRows: 300, validRows: 100, errorRows: 200, warningRows: 0 },
      errors: [],
      meta: { page: 1, limit: 50, total: 200 },
    });
    const user = userEvent.setup();

    renderDetail();
    expect(await screen.findByText("Halaman 1 dari 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Berikutnya" }));

    await waitFor(() => expect(mockedUploadsApi.getValidation).toHaveBeenCalledWith("batch-1", { page: 2, limit: 50 }));
  });

  it("shows the Confirm action for a validated batch when the user has upload.write", async () => {
    mockedUploadsApi.get.mockResolvedValue(batch("validated"));
    mockedUploadsApi.getValidation.mockResolvedValue(emptyValidation("validated"));

    renderDetail();

    expect(await screen.findByRole("button", { name: "Konfirmasi Upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rollback" })).not.toBeInTheDocument();
  });

  it("shows the Rollback action for a confirmed batch when the user has upload.write", async () => {
    mockedUploadsApi.get.mockResolvedValue(batch("confirmed"));
    mockedUploadsApi.getValidation.mockResolvedValue(emptyValidation("confirmed"));

    renderDetail();

    expect(await screen.findByRole("button", { name: "Rollback" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Konfirmasi Upload" })).not.toBeInTheDocument();
  });

  it("hides both Confirm and Rollback for a read-only user (no upload.write)", async () => {
    mockAuth(["upload.read"]);
    mockedUploadsApi.get.mockResolvedValue(batch("validated"));
    mockedUploadsApi.getValidation.mockResolvedValue(emptyValidation("validated"));

    renderDetail();

    await screen.findByText("Total Baris");
    expect(screen.queryByRole("button", { name: "Konfirmasi Upload" })).not.toBeInTheDocument();
  });

  it("refreshes the batch after a successful confirm", async () => {
    mockedUploadsApi.get.mockResolvedValueOnce(batch("validated")).mockResolvedValue(batch("confirmed"));
    mockedUploadsApi.getValidation.mockResolvedValue(emptyValidation("validated"));
    mockedUploadsApi.confirm.mockResolvedValue(batch("confirmed"));
    const user = userEvent.setup();

    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Konfirmasi Upload" }));

    await waitFor(() => expect(mockedUploadsApi.confirm).toHaveBeenCalledWith("batch-1", undefined));
    await waitFor(() => expect(screen.getByRole("button", { name: "Rollback" })).toBeInTheDocument());
  });
});
