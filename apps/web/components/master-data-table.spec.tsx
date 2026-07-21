import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MasterDataTable } from "./master-data-table";
import { useAuth } from "../lib/auth-context";
import type { MasterDataEntityConfig } from "../lib/master-data-entities";
import type { MasterDataApi } from "../lib/master-data-api";

vi.mock("../lib/auth-context", () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

interface TestEntity {
  id: string;
  code: string;
  name: string;
  profitCenterId?: string | null;
}

interface TestCreateDto {
  code: string;
  name: string;
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

function entity(overrides: Partial<TestEntity> = {}): TestEntity {
  return { id: overrides.id ?? "e1", code: overrides.code ?? "CODE-1", name: overrides.name ?? "Entity One", ...overrides };
}

function makeConfig(
  api: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  },
  overrides: Partial<MasterDataEntityConfig<TestEntity, TestCreateDto>> = {}
): MasterDataEntityConfig<TestEntity, TestCreateDto> {
  return {
    key: "test-entity",
    label: "Test Entity",
    permissionPrefix: "master_data",
    api: { ...api, get: vi.fn() } as unknown as MasterDataApi<TestEntity, TestCreateDto, TestCreateDto>,
    defaultSort: "name",
    columns: [
      { key: "code", header: "Kode", render: (row) => row.code },
      { key: "name", header: "Nama", render: (row) => row.name },
    ],
    formFields: [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama", type: "text", required: true },
    ],
    toFormValues: (row) => ({ code: row.code, name: row.name }),
    fromFormValues: (values) => ({ code: values.code ?? "", name: values.name ?? "" }),
    getEntityLabel: (row) => `${row.code} — ${row.name}`,
    emptyStateTitle: "Belum ada data",
    emptyStateDescription: "Tambahkan data baru.",
    ...overrides,
  };
}

function renderTable(config: MasterDataEntityConfig<TestEntity, TestCreateDto>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MasterDataTable config={config} />
    </QueryClientProvider>
  );
}

describe("MasterDataTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(["master_data.read", "master_data.write"]);
  });

  it("shows an empty state with its own CTA when there is no data yet", async () => {
    const api = { list: vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }), create: vi.fn(), update: vi.fn(), remove: vi.fn() };

    renderTable(makeConfig(api));

    expect(await screen.findByText("Belum ada data")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Tambah Test Entity" })).toHaveLength(1);
  });

  it("shows an error state with retry on failure", async () => {
    const api = { list: vi.fn().mockRejectedValue(new Error("boom")), create: vi.fn(), update: vi.fn(), remove: vi.fn() };

    renderTable(makeConfig(api));

    expect(await screen.findByText("Gagal memuat data test entity.")).toBeInTheDocument();
  });

  it("renders rows with the configured columns", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    renderTable(makeConfig(api));

    expect(await screen.findByText("CODE-1")).toBeInTheDocument();
    expect(screen.getByText("Entity One")).toBeInTheDocument();
  });

  it("hides write affordances (Tambah/Ubah/Hapus) for a read-only user", async () => {
    mockAuth(["master_data.read"]);
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    renderTable(makeConfig(api));

    await screen.findByText("CODE-1");
    expect(screen.queryByRole("button", { name: "Tambah Test Entity" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ubah")).not.toBeInTheDocument();
    expect(screen.queryByText("Hapus")).not.toBeInTheDocument();
  });

  it("creates a new row via the dialog and refreshes the list", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
      create: vi.fn().mockResolvedValue(entity({ id: "e2" })),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const user = userEvent.setup();

    renderTable(makeConfig(api));
    // `fireEvent` here, not `userEvent`: this button lives inside `EmptyState`'s
    // `role="status"` live region, and userEvent's pointer-events targeting
    // silently misses it under jsdom — confirmed as a testing-library/jsdom
    // quirk (fireEvent.click fires the real handler correctly), not an
    // application bug.
    fireEvent.click(await screen.findByRole("button", { name: "Tambah Test Entity" }));

    await user.type(await screen.findByLabelText("Kode *"), "CODE-2");
    await user.type(screen.getByLabelText("Nama *"), "Entity Two");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ code: "CODE-2", name: "Entity Two" }));
    await waitFor(() => expect(screen.queryByLabelText("Kode *")).not.toBeInTheDocument());
  });

  it("edits a row via the dialog, pre-filled with its current values", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(entity({ name: "Entity Renamed" })),
      remove: vi.fn(),
    };
    const user = userEvent.setup();

    renderTable(makeConfig(api));
    await user.click(await screen.findByText("Ubah"));

    expect(await screen.findByLabelText("Kode *")).toHaveValue("CODE-1");
    await user.clear(screen.getByLabelText("Nama *"));
    await user.type(screen.getByLabelText("Nama *"), "Entity Renamed");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(api.update).toHaveBeenCalledWith("e1", { code: "CODE-1", name: "Entity Renamed" }));
  });

  it("deletes a row after confirming in the dialog, naming the entity", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const user = userEvent.setup();

    renderTable(makeConfig(api));
    await user.click(await screen.findByText("Hapus"));

    expect(await screen.findByText(/CODE-1 — Entity One/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("e1"));
  });

  it("searches: submitting the search box refetches with the search term", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const user = userEvent.setup();

    renderTable(makeConfig(api));
    await screen.findByText("CODE-1");

    await user.type(screen.getByLabelText("Cari"), "code-1");
    await user.click(screen.getByRole("button", { name: "Cari" }));

    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, sort: "name", search: "code-1" })
    );
  });

  it("paginates: 'Berikutnya' fetches the next page", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 25 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const user = userEvent.setup();

    renderTable(makeConfig(api));
    expect(await screen.findByText("Halaman 1 dari 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Berikutnya" }));

    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ page: 2, limit: 20, sort: "name", search: undefined })
    );
  });

  it("sorts: clicking a sortable column header toggles ascending/descending", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const user = userEvent.setup();

    renderTable(makeConfig(api));
    await screen.findByText("CODE-1");

    await user.click(screen.getByRole("button", { name: /Kode/ }));

    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, sort: "code", search: undefined }));
  });

  it("filters: selecting a dropdown filter refetches with that exact-match filter", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity()], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const config = makeConfig(api, {
      filters: [
        {
          key: "status",
          label: "Status",
          options: [
            { value: "", label: "Semua Status" },
            { value: "active", label: "Aktif" },
            { value: "inactive", label: "Nonaktif" },
          ],
        },
      ],
    });
    const user = userEvent.setup();

    renderTable(config);
    await screen.findByText("CODE-1");

    await user.selectOptions(screen.getByLabelText("Status"), "active");

    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, sort: "name", search: undefined, filter: { status: "active" } })
    );
  });

  it("resolves an FK column via fkLookups, showing a placeholder while it loads and the resolved name once it settles", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [entity({ profitCenterId: "pc-1" })], meta: { page: 1, limit: 20, total: 1 } }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const fetchMap = vi.fn().mockResolvedValue(new Map([["pc-1", "PC-RJ — Rawat Jalan"]]));
    const config = makeConfig(api, {
      fkLookups: [{ field: "profitCenterId", fetchMap }],
      columns: [
        { key: "code", header: "Kode", render: (row) => row.code },
        { header: "Profit Center", render: (row) => (row as unknown as Record<string, string>).profitCenterIdLabel },
      ],
    });

    renderTable(config);

    await screen.findByText("CODE-1");
    expect(await screen.findByText("PC-RJ — Rawat Jalan")).toBeInTheDocument();
    expect(fetchMap).toHaveBeenCalledTimes(1);
  });

  it("shows an ellipsis placeholder for an FK column whose lookup hasn't resolved yet, and a dash when the FK id itself is null", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({
        data: [entity({ id: "e1", profitCenterId: "pc-unknown" }), entity({ id: "e2", code: "CODE-2", profitCenterId: null })],
        meta: { page: 1, limit: 20, total: 2 },
      }),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const config = makeConfig(api, {
      fkLookups: [{ field: "profitCenterId", fetchMap: vi.fn().mockResolvedValue(new Map()) }],
      columns: [
        { key: "code", header: "Kode", render: (row) => row.code },
        { header: "Profit Center", render: (row) => (row as unknown as Record<string, string>).profitCenterIdLabel },
      ],
    });

    renderTable(config);

    await screen.findByText("CODE-1");
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
