import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MasterDataForm, defaultFormValues } from "./master-data-form";
import { ApiRequestError } from "../lib/api-client";
import type { MasterDataFormField } from "../lib/master-data-entities";

const fields: MasterDataFormField[] = [
  { name: "code", label: "Kode", type: "text", required: true },
  { name: "name", label: "Nama", type: "text", required: true },
  { name: "description", label: "Deskripsi", type: "textarea" },
];

function renderForm(overrides: Partial<Parameters<typeof MasterDataForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <MasterDataForm
      fields={fields}
      initialValues={{ code: "", name: "", description: "" }}
      submitLabel="Simpan"
      pendingLabel="Menyimpan..."
      isPending={false}
      error={undefined}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onSubmit, onCancel };
}

describe("MasterDataForm", () => {
  it("renders one input per field, pre-filled from initialValues", () => {
    render(
      <MasterDataForm
        fields={fields}
        initialValues={{ code: "DRV-01", name: "Luas Lantai", description: "" }}
        submitLabel="Simpan"
        pendingLabel="Menyimpan..."
        isPending={false}
        error={undefined}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Kode *")).toHaveValue("DRV-01");
    expect(screen.getByLabelText("Nama *")).toHaveValue("Luas Lantai");
    expect(screen.getByLabelText("Deskripsi")).toHaveValue("");
  });

  it("keeps submit disabled until every required field is filled", async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();

    await user.type(screen.getByLabelText("Kode *"), "DRV-01");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();

    await user.type(screen.getByLabelText("Nama *"), "Luas Lantai");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(onSubmit).toHaveBeenCalledWith({ code: "DRV-01", name: "Luas Lantai", description: "" });
  });

  it("does not gate the optional field", async () => {
    renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Kode *"), "DRV-01");
    await user.type(screen.getByLabelText("Nama *"), "Luas Lantai");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
  });

  it("calls onCancel from the Batal button", async () => {
    const { onCancel } = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows the API's error message", () => {
    renderForm({ error: new ApiRequestError(409, { code: "DRIVER_CODE_TAKEN", message: "Driver code already exists.", traceId: "t1" }) });

    expect(screen.getByText("Driver code already exists.")).toBeInTheDocument();
  });

  it("shows the pending label and disables the submit button while pending", () => {
    renderForm({ isPending: true, initialValues: { code: "DRV-01", name: "Luas Lantai", description: "" } });

    expect(screen.getByRole("button", { name: "Menyimpan..." })).toBeDisabled();
  });

  it("renders a select field and does not block submit on its required default value", async () => {
    const selectFields: MasterDataFormField[] = [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama", type: "text", required: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { value: "active", label: "Aktif" },
          { value: "inactive", label: "Nonaktif" },
        ],
      },
    ];
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <MasterDataForm
        fields={selectFields}
        initialValues={defaultFormValues(selectFields)}
        submitLabel="Simpan"
        pendingLabel="Menyimpan..."
        isPending={false}
        error={undefined}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Status *")).toHaveValue("active");
    await user.type(screen.getByLabelText("Kode *"), "DOC-01");
    await user.type(screen.getByLabelText("Nama *"), "dr. Test");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(onSubmit).toHaveBeenCalledWith({ code: "DOC-01", name: "dr. Test", status: "active" });
  });
});

describe("defaultFormValues", () => {
  it("defaults select fields to their first option, and everything else to an empty string", () => {
    const fieldsWithSelect: MasterDataFormField[] = [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }] },
    ];

    expect(defaultFormValues(fieldsWithSelect)).toEqual({ code: "", status: "active" });
  });

  it("defaults fk-select fields to an empty string (no sensible default until the user picks)", () => {
    const fieldsWithFk: MasterDataFormField[] = [
      { name: "profitCenterId", label: "Profit Center", type: "fk-select", fkOptions: vi.fn() },
    ];

    expect(defaultFormValues(fieldsWithFk)).toEqual({ profitCenterId: "" });
  });
});

function renderFormWithQueryClient(props: Parameters<typeof MasterDataForm>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MasterDataForm {...props} />
    </QueryClientProvider>
  );
}

describe("MasterDataForm — fk-select fields", () => {
  it("fetches and renders options, and blocks submit until one is chosen", async () => {
    const fkFields: MasterDataFormField[] = [
      { name: "code", label: "Kode", type: "text", required: true },
      {
        name: "profitCenterId",
        label: "Profit Center",
        type: "fk-select",
        required: true,
        fkOptions: vi.fn().mockResolvedValue([{ value: "pc-1", label: "PC-RJ — Rawat Jalan" }]),
        fkPlaceholder: "Pilih profit center...",
      },
    ];
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderFormWithQueryClient({
      fields: fkFields,
      initialValues: defaultFormValues(fkFields),
      submitLabel: "Simpan",
      pendingLabel: "Menyimpan...",
      isPending: false,
      error: undefined,
      onSubmit,
      onCancel: vi.fn(),
    });

    await user.type(screen.getByLabelText("Kode *"), "SVC-01");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();

    await waitFor(() => expect(screen.getByRole("option", { name: "PC-RJ — Rawat Jalan" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Profit Center *"), "pc-1");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(onSubmit).toHaveBeenCalledWith({ code: "SVC-01", profitCenterId: "pc-1" });
  });
});

describe("MasterDataForm — visibleIf", () => {
  const conditionalFields: MasterDataFormField[] = [
    {
      name: "type",
      label: "Tipe",
      type: "select",
      required: true,
      options: [
        { value: "indirect", label: "Tidak Langsung" },
        { value: "direct", label: "Langsung" },
      ],
    },
    {
      name: "profitCenterId",
      label: "Profit Center",
      type: "fk-select",
      required: true,
      fkOptions: vi.fn().mockResolvedValue([{ value: "pc-1", label: "PC-RJ — Rawat Jalan" }]),
      visibleIf: (values) => values.type === "direct",
    },
  ];

  it("hides a conditionally-required field, and does not block submit while it's hidden", async () => {
    const onSubmit = vi.fn();

    renderFormWithQueryClient({
      fields: conditionalFields,
      initialValues: defaultFormValues(conditionalFields),
      submitLabel: "Simpan",
      pendingLabel: "Menyimpan...",
      isPending: false,
      error: undefined,
      onSubmit,
      onCancel: vi.fn(),
    });

    expect(screen.queryByLabelText("Profit Center *")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
  });

  it("shows and requires the field once the condition is met", async () => {
    const user = userEvent.setup();

    renderFormWithQueryClient({
      fields: conditionalFields,
      initialValues: defaultFormValues(conditionalFields),
      submitLabel: "Simpan",
      pendingLabel: "Menyimpan...",
      isPending: false,
      error: undefined,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    });

    await user.selectOptions(screen.getByLabelText("Tipe *"), "direct");

    expect(await screen.findByLabelText("Profit Center *")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
});
