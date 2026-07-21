import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HospitalSettingsForm } from "./hospital-settings-form";
import { hospitalSettingsApi } from "../lib/hospital-settings-api";
import { ApiRequestError } from "../lib/api-client";
import type { HospitalSettings } from "../lib/hospital-settings-api";

vi.mock("../lib/hospital-settings-api", () => ({ hospitalSettingsApi: { get: vi.fn(), update: vi.fn() } }));

const mockedHospitalSettingsApi = vi.mocked(hospitalSettingsApi);

function settings(overrides: Partial<HospitalSettings> = {}): HospitalSettings {
  return {
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
    ...overrides,
  };
}

function renderForm(canWrite: boolean, overrides: Partial<HospitalSettings> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HospitalSettingsForm settings={settings(overrides)} canWrite={canWrite} />
    </QueryClientProvider>
  );
}

describe("HospitalSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-fills every field from the settings prop", () => {
    renderForm(true, { fiscalYearStartMonth: 4, maxUploadFileSizeMb: 50 });

    expect(screen.getByLabelText("Metode Alokasi Default")).toHaveValue("step_down");
    expect(screen.getByLabelText("Target Margin Default (%)")).toHaveValue(15);
    expect(screen.getByLabelText("Awal Tahun Fiskal")).toHaveValue("4");
    expect(screen.getByLabelText("Locale")).toHaveValue("id-ID");
    expect(screen.getByLabelText("Ukuran Maksimum File Upload (MB)")).toHaveValue(50);
    expect(screen.getByLabelText("Multiplier Deviasi Standar untuk Outlier")).toHaveValue(3);
  });

  it("disables every field and hides Simpan for a read-only user", () => {
    renderForm(false);

    expect(screen.getByLabelText("Metode Alokasi Default")).toBeDisabled();
    expect(screen.getByLabelText("Target Margin Default (%)")).toBeDisabled();
    expect(screen.getByLabelText("Locale")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
  });

  it("enables every field and shows Simpan for a user with hospital.write", () => {
    renderForm(true);

    expect(screen.getByLabelText("Metode Alokasi Default")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeInTheDocument();
  });

  it("submits the edited values with numeric fields coerced to numbers", async () => {
    mockedHospitalSettingsApi.update.mockResolvedValue(settings({ locale: "en-US" }));
    const user = userEvent.setup();

    renderForm(true);
    await user.clear(screen.getByLabelText("Locale"));
    await user.type(screen.getByLabelText("Locale"), "en-US");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(mockedHospitalSettingsApi.update).toHaveBeenCalledWith({
        allocationMethod: "step_down",
        defaultTargetMargin: 15,
        fiscalYearStartMonth: 1,
        locale: "en-US",
        maxUploadFileSizeMb: 25,
        outlierStddevMultiplier: 3,
      })
    );
  });

  it("shows a success message after a successful save", async () => {
    mockedHospitalSettingsApi.update.mockResolvedValue(settings());
    const user = userEvent.setup();

    renderForm(true);
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Perubahan disimpan.")).toBeInTheDocument();
  });

  it("shows the API's error message and no success message when the save fails", async () => {
    mockedHospitalSettingsApi.update.mockRejectedValue(
      new ApiRequestError(403, { code: "PERMISSION_DENIED", message: "Anda tidak memiliki izin.", traceId: "t1" })
    );
    const user = userEvent.setup();

    renderForm(true);
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Anda tidak memiliki izin.")).toBeInTheDocument();
    expect(screen.queryByText("Perubahan disimpan.")).not.toBeInTheDocument();
  });
});
