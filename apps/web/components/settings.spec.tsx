import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Settings } from "./settings";
import { hospitalSettingsApi } from "../lib/hospital-settings-api";
import { useAuth } from "../lib/auth-context";

vi.mock("../lib/hospital-settings-api", () => ({ hospitalSettingsApi: { get: vi.fn(), update: vi.fn() } }));
vi.mock("../lib/auth-context", () => ({ useAuth: vi.fn() }));

const mockedHospitalSettingsApi = vi.mocked(hospitalSettingsApi);
const mockedUseAuth = vi.mocked(useAuth);

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

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Settings />
    </QueryClientProvider>
  );
}

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(["hospital.read", "hospital.write"]);
  });

  it("shows an error state with retry on failure", async () => {
    mockedHospitalSettingsApi.get.mockRejectedValue(new Error("boom"));

    renderSettings();

    expect(await screen.findByText("Gagal memuat pengaturan hospital.")).toBeInTheDocument();
  });

  it("renders the settings form once loaded", async () => {
    mockedHospitalSettingsApi.get.mockResolvedValue({
      id: "s1",
      hospitalId: "h1",
      allocationMethod: "step_down",
      defaultTargetMargin: "15.00",
      fiscalYearStartMonth: 1,
      locale: "id-ID",
      maxUploadFileSizeMb: 25,
      outlierStddevMultiplier: "3.00",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    renderSettings();

    expect(await screen.findByText("Pengaturan Hospital")).toBeInTheDocument();
    expect(screen.getByLabelText("Locale")).toHaveValue("id-ID");
  });

  it("passes read-only permission through to the form for a user without hospital.write", async () => {
    mockAuth(["hospital.read"]);
    mockedHospitalSettingsApi.get.mockResolvedValue({
      id: "s1",
      hospitalId: "h1",
      allocationMethod: "step_down",
      defaultTargetMargin: "15.00",
      fiscalYearStartMonth: 1,
      locale: "id-ID",
      maxUploadFileSizeMb: 25,
      outlierStddevMultiplier: "3.00",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    renderSettings();

    await screen.findByText("Pengaturan Hospital");
    expect(screen.getByLabelText("Locale")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
  });
});
