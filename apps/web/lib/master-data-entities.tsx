import type { ReactNode } from "react";
import type { DataTableColumn } from "@hpp/ui";
import { driversApi, driverMasterDataApi, type Driver, type CreateDriverDto } from "./drivers-api";
import { profitCentersApi, profitCenterMasterDataApi, type ProfitCenter, type CreateProfitCenterDto } from "./profit-centers-api";
import { doctorMasterDataApi, type Doctor, type CreateDoctorDto } from "./doctors-api";
import { vendorMasterDataApi, type Vendor, type CreateVendorDto } from "./vendors-api";
import { coaAccountMasterDataApi, type CoaAccount, type CreateCoaAccountDto } from "./coa-accounts-api";
import { costCentersApi, costCenterMasterDataApi, type CostCenter, type CreateCostCenterDto } from "./cost-centers-api";
import { employeeMasterDataApi, type Employee, type CreateEmployeeDto } from "./employees-api";
import { assetMasterDataApi, type Asset, type CreateAssetDto } from "./assets-api";
import { bmhpItemMasterDataApi, type BmhpItem, type CreateBmhpItemDto } from "./bmhp-items-api";
import { serviceMasterDataApi, type ServiceEntity, type CreateServiceDto } from "./services-api";
import { allocationRuleMasterDataApi, type AllocationRule, type CreateAllocationRuleDto } from "./allocation-rules-api";
import { tariffMasterDataApi, type Tariff, type CreateTariffDto } from "./tariffs-api";
import type { MasterDataApi } from "./master-data-api";
import { formatCurrencyIDR, formatDate } from "./format";

export type MasterDataFieldType = "text" | "textarea" | "number" | "date" | "select" | "fk-select";

export interface MasterDataFormField {
  name: string;
  label: string;
  type: MasterDataFieldType;
  required?: boolean;
  /** Only for `type: "select"`. */
  options?: { value: string; label: string }[];
  /** Only for `type: "fk-select"` — fetches the dropdown options (id/label pairs) from another entity's lookup API. */
  fkOptions?: () => Promise<{ value: string; label: string }[]>;
  /** Only for `type: "fk-select"`, e.g. "Pilih profit center...". */
  fkPlaceholder?: string;
  /** Omit the field entirely (not rendered, not required, not submitted) unless this returns true — e.g. CostCenter's `profitCenterId` only applies when `type === "direct"` (docs/02 — the one conditional-FK case in the schema). */
  visibleIf?: (values: Record<string, string>) => boolean;
}

export interface MasterDataFilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * One config per entity drives the whole generic Master Data page (table
 * columns, create/edit form, API calls) — the 12 master-data entities
 * (`apps/api/src/master-data/*`) all share the same 5-endpoint REST shape,
 * so a hand-written component per entity would just be the same table+form
 * copied 12 times. `CreateDto` is used for both create and update payloads:
 * every `Update*Dto` on the backend is `PartialType(Create*Dto)`, so an
 * object shaped like `CreateDto` is always structurally valid for update too.
 */
export interface MasterDataEntityConfig<TEntity extends { id: string }, TCreateDto> {
  key: string;
  label: string;
  /** `master_data` for most entities, `tariff` for Tariff (docs/04_RBAC.md §3). */
  permissionPrefix: string;
  api: MasterDataApi<TEntity, TCreateDto, TCreateDto>;
  columns: DataTableColumn<TEntity>[];
  defaultSort: string;
  /** Exact-match dropdown filters, sourced from the entity's `filterableFields` allow-list (`*.service.ts`). */
  filters?: MasterDataFilterConfig[];
  /** FK id columns (e.g. `profitCenterId`) resolved to a human-readable label for display — `columns[].render` reads `row[\`${field}Label\`]` once resolved. */
  fkLookups?: { field: string; fetchMap: () => Promise<Map<string, string>> }[];
  formFields: MasterDataFormField[];
  toFormValues: (entity: TEntity) => Record<string, string>;
  fromFormValues: (values: Record<string, string>) => TCreateDto;
  /** Human-readable identifier for the delete-confirmation dialog — not every entity has both `code` and `name` (e.g. Tariff has neither), so this can't be derived structurally. */
  getEntityLabel: (entity: TEntity) => string;
  emptyStateTitle: string;
  emptyStateDescription: string;
}

function textCell(value: string | null | undefined): ReactNode {
  return value ?? "—";
}

const STATUS_OPTIONS = [
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

const STATUS_FILTER: MasterDataFilterConfig = {
  key: "status",
  label: "Status",
  options: [{ value: "", label: "Semua Status" }, ...STATUS_OPTIONS],
};

function statusCell(status: "active" | "inactive"): ReactNode {
  return (
    <span className={status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
      {status === "active" ? "Aktif" : "Nonaktif"}
    </span>
  );
}

/**
 * Allocated-costs/allocation-run tables resolve FK ids to names by fetching
 * a lookup and building a `Map` (see `AllocationRunDetail`) — the same
 * pattern here, but generalized: `MasterDataTable` enriches each row with a
 * `${field}Label` string once its `fkLookups` map resolves, and this reads
 * it back. The cast is required because the synthetic property isn't part
 * of any entity's real response DTO — `MasterDataTable` adds it at render
 * time (see its doc comment).
 */
function fkLabelCell(row: object, field: string): ReactNode {
  const label = (row as Record<string, unknown>)[`${field}Label`];
  return typeof label === "string" ? label : "—";
}

async function fetchProfitCenterOptions(): Promise<{ value: string; label: string }[]> {
  const res = await profitCentersApi.list();
  return res.data.map((pc) => ({ value: pc.id, label: `${pc.code} — ${pc.name}` }));
}
async function profitCenterLookupMap(): Promise<Map<string, string>> {
  return new Map((await fetchProfitCenterOptions()).map((o) => [o.value, o.label]));
}

async function fetchCostCenterOptions(): Promise<{ value: string; label: string }[]> {
  const res = await costCentersApi.list();
  return res.data.map((cc) => ({ value: cc.id, label: `${cc.code} — ${cc.name}` }));
}
async function costCenterLookupMap(): Promise<Map<string, string>> {
  return new Map((await fetchCostCenterOptions()).map((o) => [o.value, o.label]));
}

async function fetchVendorOptions(): Promise<{ value: string; label: string }[]> {
  const res = await vendorMasterDataApi.list({ limit: 100 });
  return res.data.map((vendor) => ({ value: vendor.id, label: `${vendor.code} — ${vendor.name}` }));
}
async function vendorLookupMap(): Promise<Map<string, string>> {
  return new Map((await fetchVendorOptions()).map((o) => [o.value, o.label]));
}

async function fetchDriverOptions(): Promise<{ value: string; label: string }[]> {
  const res = await driversApi.list();
  return res.data.map((driver) => ({ value: driver.id, label: `${driver.code} — ${driver.name}` }));
}
async function driverLookupMap(): Promise<Map<string, string>> {
  return new Map((await fetchDriverOptions()).map((o) => [o.value, o.label]));
}

async function fetchServiceOptions(): Promise<{ value: string; label: string }[]> {
  const res = await serviceMasterDataApi.list({ limit: 100 });
  return res.data.map((service) => ({ value: service.id, label: `${service.code} — ${service.name}` }));
}
async function serviceLookupMap(): Promise<Map<string, string>> {
  return new Map((await fetchServiceOptions()).map((o) => [o.value, o.label]));
}

const COST_CENTER_TYPE_OPTIONS = [
  { value: "indirect", label: "Tidak Langsung" },
  { value: "direct", label: "Langsung" },
];

function costCenterTypeCell(type: "direct" | "indirect"): ReactNode {
  return type === "direct" ? "Langsung" : "Tidak Langsung";
}

const driverConfig: MasterDataEntityConfig<Driver, CreateDriverDto> = {
  key: "driver",
  label: "Driver Alokasi",
  permissionPrefix: "master_data",
  api: driverMasterDataApi,
  defaultSort: "name",
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "unit", header: "Satuan", render: (row) => row.unit },
    { header: "Deskripsi", render: (row) => textCell(row.description) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "unit", label: "Satuan", type: "text", required: true },
    { name: "description", label: "Deskripsi", type: "textarea" },
  ],
  toFormValues: (driver) => ({
    code: driver.code,
    name: driver.name,
    unit: driver.unit,
    description: driver.description ?? "",
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    unit: values.unit ?? "",
    description: values.description || undefined,
  }),
  getEntityLabel: (driver) => `${driver.code} — ${driver.name}`,
  emptyStateTitle: "Belum ada driver alokasi",
  emptyStateDescription: "Tambahkan driver untuk digunakan sebagai basis alokasi biaya (mis. jumlah pegawai, luas lantai).",
};

const profitCenterConfig: MasterDataEntityConfig<ProfitCenter, CreateProfitCenterDto> = {
  key: "profit-center",
  label: "Profit Center",
  permissionPrefix: "master_data",
  api: profitCenterMasterDataApi,
  defaultSort: "name",
  filters: [STATUS_FILTER],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "department", header: "Departemen", render: (row) => textCell(row.department) },
    { key: "status", header: "Status", render: (row) => statusCell(row.status) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "department", label: "Departemen", type: "text" },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
  ],
  toFormValues: (pc) => ({
    code: pc.code,
    name: pc.name,
    department: pc.department ?? "",
    status: pc.status,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    department: values.department || undefined,
    status: (values.status ?? "active") as "active" | "inactive",
  }),
  getEntityLabel: (pc) => `${pc.code} — ${pc.name}`,
  emptyStateTitle: "Belum ada profit center",
  emptyStateDescription: "Tambahkan unit penghasil pendapatan seperti Rawat Jalan, IGD, atau Laboratorium.",
};

const doctorConfig: MasterDataEntityConfig<Doctor, CreateDoctorDto> = {
  key: "doctor",
  label: "Dokter",
  permissionPrefix: "master_data",
  api: doctorMasterDataApi,
  defaultSort: "name",
  filters: [STATUS_FILTER],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "specialty", header: "Spesialisasi", render: (row) => textCell(row.specialty) },
    { key: "status", header: "Status", render: (row) => statusCell(row.status) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "specialty", label: "Spesialisasi", type: "text" },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
  ],
  toFormValues: (doctor) => ({
    code: doctor.code,
    name: doctor.name,
    specialty: doctor.specialty ?? "",
    status: doctor.status,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    specialty: values.specialty || undefined,
    status: (values.status ?? "active") as "active" | "inactive",
  }),
  getEntityLabel: (doctor) => `${doctor.code} — ${doctor.name}`,
  emptyStateTitle: "Belum ada data dokter",
  emptyStateDescription: "Tambahkan dokter untuk digunakan pada Doctor Analytics dan alokasi jasa medis.",
};

const vendorConfig: MasterDataEntityConfig<Vendor, CreateVendorDto> = {
  key: "vendor",
  label: "Vendor",
  permissionPrefix: "master_data",
  api: vendorMasterDataApi,
  defaultSort: "name",
  filters: [STATUS_FILTER],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "category", header: "Kategori", render: (row) => textCell(row.category) },
    { key: "status", header: "Status", render: (row) => statusCell(row.status) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "category", label: "Kategori", type: "text" },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
  ],
  toFormValues: (vendor) => ({
    code: vendor.code,
    name: vendor.name,
    category: vendor.category ?? "",
    status: vendor.status,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    category: values.category || undefined,
    status: (values.status ?? "active") as "active" | "inactive",
  }),
  getEntityLabel: (vendor) => `${vendor.code} — ${vendor.name}`,
  emptyStateTitle: "Belum ada data vendor",
  emptyStateDescription: "Tambahkan pemasok BMHP atau layanan lain yang ditagih ke rumah sakit.",
};

const coaAccountConfig: MasterDataEntityConfig<CoaAccount, CreateCoaAccountDto> = {
  key: "coa-account",
  label: "Akun COA",
  permissionPrefix: "master_data",
  api: coaAccountMasterDataApi,
  defaultSort: "code",
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "category", header: "Kategori", render: (row) => row.category },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "category", label: "Kategori", type: "text", required: true },
  ],
  toFormValues: (account) => ({
    code: account.code,
    name: account.name,
    category: account.category,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    category: values.category ?? "",
  }),
  getEntityLabel: (account) => `${account.code} — ${account.name}`,
  emptyStateTitle: "Belum ada akun COA",
  emptyStateDescription: "Tambahkan akun Chart of Accounts untuk pemetaan biaya dan pendapatan.",
};

const costCenterConfig: MasterDataEntityConfig<CostCenter, CreateCostCenterDto> = {
  key: "cost-center",
  label: "Cost Center",
  permissionPrefix: "master_data",
  api: costCenterMasterDataApi,
  defaultSort: "name",
  filters: [
    {
      key: "type",
      label: "Tipe",
      options: [{ value: "", label: "Semua Tipe" }, ...COST_CENTER_TYPE_OPTIONS],
    },
    STATUS_FILTER,
  ],
  fkLookups: [{ field: "profitCenterId", fetchMap: profitCenterLookupMap }],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "type", header: "Tipe", render: (row) => costCenterTypeCell(row.type) },
    { header: "Profit Center", render: (row) => (row.type === "direct" ? fkLabelCell(row, "profitCenterId") : "—") },
    { key: "status", header: "Status", render: (row) => statusCell(row.status) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "type", label: "Tipe", type: "select", required: true, options: COST_CENTER_TYPE_OPTIONS },
    {
      name: "profitCenterId",
      label: "Profit Center",
      type: "fk-select",
      required: true,
      fkOptions: fetchProfitCenterOptions,
      fkPlaceholder: "Pilih profit center...",
      visibleIf: (values) => values.type === "direct",
    },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
  ],
  toFormValues: (cc) => ({
    code: cc.code,
    name: cc.name,
    type: cc.type,
    profitCenterId: cc.profitCenterId ?? "",
    status: cc.status,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    type: (values.type ?? "indirect") as "direct" | "indirect",
    profitCenterId: values.type === "direct" ? values.profitCenterId : undefined,
    status: (values.status ?? "active") as "active" | "inactive",
  }),
  getEntityLabel: (cc) => `${cc.code} — ${cc.name}`,
  emptyStateTitle: "Belum ada cost center",
  emptyStateDescription: "Tambahkan unit non-profit seperti HRD, Laundry, IT, atau CSSD.",
};

const employeeConfig: MasterDataEntityConfig<Employee, CreateEmployeeDto> = {
  key: "employee",
  label: "Karyawan",
  permissionPrefix: "master_data",
  api: employeeMasterDataApi,
  defaultSort: "name",
  filters: [STATUS_FILTER],
  fkLookups: [{ field: "departmentCostCenterId", fetchMap: costCenterLookupMap }],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "roleTitle", header: "Jabatan", render: (row) => textCell(row.roleTitle) },
    { header: "Cost Center", render: (row) => fkLabelCell(row, "departmentCostCenterId") },
    { key: "employmentType", header: "Tipe Kepegawaian", render: (row) => row.employmentType },
    { key: "status", header: "Status", render: (row) => statusCell(row.status) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "roleTitle", label: "Jabatan", type: "text" },
    {
      name: "departmentCostCenterId",
      label: "Cost Center",
      type: "fk-select",
      fkOptions: fetchCostCenterOptions,
      fkPlaceholder: "Pilih cost center...",
    },
    { name: "employmentType", label: "Tipe Kepegawaian", type: "text", required: true },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
  ],
  toFormValues: (employee) => ({
    code: employee.code,
    name: employee.name,
    roleTitle: employee.roleTitle ?? "",
    departmentCostCenterId: employee.departmentCostCenterId ?? "",
    employmentType: employee.employmentType,
    status: employee.status,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    roleTitle: values.roleTitle || undefined,
    departmentCostCenterId: values.departmentCostCenterId || undefined,
    employmentType: values.employmentType ?? "",
    status: (values.status ?? "active") as "active" | "inactive",
  }),
  getEntityLabel: (employee) => `${employee.code} — ${employee.name}`,
  emptyStateTitle: "Belum ada data karyawan",
  emptyStateDescription: "Tambahkan karyawan untuk atribusi biaya gaji ke cost center.",
};

const assetConfig: MasterDataEntityConfig<Asset, CreateAssetDto> = {
  key: "asset",
  label: "Aset",
  permissionPrefix: "master_data",
  api: assetMasterDataApi,
  defaultSort: "name",
  filters: [STATUS_FILTER],
  fkLookups: [{ field: "costCenterId", fetchMap: costCenterLookupMap }],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "category", header: "Kategori", render: (row) => row.category },
    { header: "Cost Center", render: (row) => fkLabelCell(row, "costCenterId") },
    { key: "acquisitionCost", header: "Nilai Perolehan", align: "right", render: (row) => formatCurrencyIDR(row.acquisitionCost) },
    { key: "usefulLifeMonths", header: "Umur Manfaat (bln)", align: "right", render: (row) => row.usefulLifeMonths },
    { key: "status", header: "Status", render: (row) => statusCell(row.status) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "category", label: "Kategori", type: "text", required: true },
    {
      name: "costCenterId",
      label: "Cost Center",
      type: "fk-select",
      fkOptions: fetchCostCenterOptions,
      fkPlaceholder: "Pilih cost center...",
    },
    { name: "acquisitionCost", label: "Nilai Perolehan (Rp)", type: "number", required: true },
    { name: "depreciationMethod", label: "Metode Depresiasi", type: "text", required: true },
    { name: "usefulLifeMonths", label: "Umur Manfaat (bulan)", type: "number", required: true },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
  ],
  toFormValues: (asset) => ({
    code: asset.code,
    name: asset.name,
    category: asset.category,
    costCenterId: asset.costCenterId ?? "",
    acquisitionCost: asset.acquisitionCost,
    depreciationMethod: asset.depreciationMethod,
    usefulLifeMonths: String(asset.usefulLifeMonths),
    status: asset.status,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    category: values.category ?? "",
    costCenterId: values.costCenterId || undefined,
    acquisitionCost: Number(values.acquisitionCost ?? 0),
    depreciationMethod: values.depreciationMethod ?? "",
    usefulLifeMonths: Number(values.usefulLifeMonths ?? 0),
    status: (values.status ?? "active") as "active" | "inactive",
  }),
  getEntityLabel: (asset) => `${asset.code} — ${asset.name}`,
  emptyStateTitle: "Belum ada data aset",
  emptyStateDescription: "Tambahkan aset (alat medis, kendaraan, dll.) untuk perhitungan depresiasi.",
};

const bmhpItemConfig: MasterDataEntityConfig<BmhpItem, CreateBmhpItemDto> = {
  key: "bmhp-item",
  label: "Item BMHP",
  permissionPrefix: "master_data",
  api: bmhpItemMasterDataApi,
  defaultSort: "name",
  filters: [STATUS_FILTER],
  fkLookups: [{ field: "vendorId", fetchMap: vendorLookupMap }],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { key: "unit", header: "Satuan", render: (row) => row.unit },
    { key: "standardCost", header: "Harga Standar", align: "right", render: (row) => formatCurrencyIDR(row.standardCost) },
    { header: "Vendor", render: (row) => fkLabelCell(row, "vendorId") },
    { key: "status", header: "Status", render: (row) => statusCell(row.status) },
  ],
  formFields: [
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "unit", label: "Satuan", type: "text", required: true },
    { name: "standardCost", label: "Harga Standar (Rp)", type: "number", required: true },
    {
      name: "vendorId",
      label: "Vendor",
      type: "fk-select",
      fkOptions: fetchVendorOptions,
      fkPlaceholder: "Pilih vendor...",
    },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
  ],
  toFormValues: (item) => ({
    code: item.code,
    name: item.name,
    unit: item.unit,
    standardCost: item.standardCost,
    vendorId: item.vendorId ?? "",
    status: item.status,
  }),
  fromFormValues: (values) => ({
    code: values.code ?? "",
    name: values.name ?? "",
    unit: values.unit ?? "",
    standardCost: Number(values.standardCost ?? 0),
    vendorId: values.vendorId || undefined,
    status: (values.status ?? "active") as "active" | "inactive",
  }),
  getEntityLabel: (item) => `${item.code} — ${item.name}`,
  emptyStateTitle: "Belum ada item BMHP",
  emptyStateDescription: "Tambahkan Bahan Medis Habis Pakai (sarung tangan, kasa, dll.) untuk perhitungan unit cost.",
};

const serviceConfig: MasterDataEntityConfig<ServiceEntity, CreateServiceDto> = {
  key: "service",
  label: "Layanan",
  permissionPrefix: "master_data",
  api: serviceMasterDataApi,
  defaultSort: "name",
  fkLookups: [{ field: "profitCenterId", fetchMap: profitCenterLookupMap }],
  columns: [
    { key: "code", header: "Kode", render: (row) => row.code },
    { key: "name", header: "Nama", render: (row) => row.name },
    { header: "Profit Center", render: (row) => fkLabelCell(row, "profitCenterId") },
    { key: "serviceType", header: "Tipe Layanan", render: (row) => row.serviceType },
    {
      key: "standardDuration",
      header: "Durasi (menit)",
      align: "right",
      render: (row) => (row.standardDuration === null ? "—" : row.standardDuration),
    },
    {
      header: "Tarif Saat Ini",
      align: "right",
      render: (row) => (row.currentTariff === null ? "—" : formatCurrencyIDR(row.currentTariff)),
    },
  ],
  formFields: [
    {
      name: "profitCenterId",
      label: "Profit Center",
      type: "fk-select",
      required: true,
      fkOptions: fetchProfitCenterOptions,
      fkPlaceholder: "Pilih profit center...",
    },
    { name: "code", label: "Kode", type: "text", required: true },
    { name: "name", label: "Nama", type: "text", required: true },
    { name: "serviceType", label: "Tipe Layanan", type: "text", required: true },
    { name: "standardDuration", label: "Durasi Standar (menit)", type: "number" },
  ],
  toFormValues: (service) => ({
    profitCenterId: service.profitCenterId,
    code: service.code,
    name: service.name,
    serviceType: service.serviceType,
    standardDuration: service.standardDuration === null ? "" : String(service.standardDuration),
  }),
  fromFormValues: (values) => ({
    profitCenterId: values.profitCenterId ?? "",
    code: values.code ?? "",
    name: values.name ?? "",
    serviceType: values.serviceType ?? "",
    standardDuration: values.standardDuration ? Number(values.standardDuration) : undefined,
  }),
  getEntityLabel: (service) => `${service.code} — ${service.name}`,
  emptyStateTitle: "Belum ada data layanan",
  emptyStateDescription: "Tambahkan layanan medis (konsultasi, tindakan, dll.) untuk perhitungan unit cost dan tarif.",
};

const ALLOCATION_METHOD_OPTIONS = [
  { value: "step_down", label: "Step-Down" },
  { value: "direct", label: "Direct" },
];

function allocationMethodCell(method: string): ReactNode {
  return ALLOCATION_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

const allocationRuleConfig: MasterDataEntityConfig<AllocationRule, CreateAllocationRuleDto> = {
  key: "allocation-rule",
  label: "Aturan Alokasi",
  permissionPrefix: "master_data",
  api: allocationRuleMasterDataApi,
  defaultSort: "priority",
  filters: [
    {
      key: "method",
      label: "Metode",
      options: [{ value: "", label: "Semua Metode" }, ...ALLOCATION_METHOD_OPTIONS],
    },
  ],
  fkLookups: [
    { field: "costCenterId", fetchMap: costCenterLookupMap },
    { field: "driverId", fetchMap: driverLookupMap },
  ],
  columns: [
    { header: "Cost Center", render: (row) => fkLabelCell(row, "costCenterId") },
    { header: "Driver", render: (row) => fkLabelCell(row, "driverId") },
    { key: "method", header: "Metode", render: (row) => allocationMethodCell(row.method) },
    { key: "priority", header: "Prioritas", align: "right", render: (row) => row.priority },
    { key: "effectivePeriod", header: "Periode Berlaku", render: (row) => row.effectivePeriod },
  ],
  formFields: [
    {
      name: "costCenterId",
      label: "Cost Center",
      type: "fk-select",
      required: true,
      fkOptions: fetchCostCenterOptions,
      fkPlaceholder: "Pilih cost center...",
    },
    {
      name: "driverId",
      label: "Driver",
      type: "fk-select",
      required: true,
      fkOptions: fetchDriverOptions,
      fkPlaceholder: "Pilih driver...",
    },
    { name: "method", label: "Metode", type: "select", required: true, options: ALLOCATION_METHOD_OPTIONS },
    { name: "priority", label: "Prioritas", type: "number", required: true },
    { name: "effectivePeriod", label: "Periode Berlaku (mis. 2026-06)", type: "text", required: true },
  ],
  toFormValues: (rule) => ({
    costCenterId: rule.costCenterId,
    driverId: rule.driverId,
    method: rule.method,
    priority: String(rule.priority),
    effectivePeriod: rule.effectivePeriod,
  }),
  fromFormValues: (values) => ({
    costCenterId: values.costCenterId ?? "",
    driverId: values.driverId ?? "",
    method: values.method ?? "",
    priority: Number(values.priority ?? 0),
    effectivePeriod: values.effectivePeriod ?? "",
  }),
  getEntityLabel: (rule) => `${fkLabelCell(rule, "costCenterId")} → ${fkLabelCell(rule, "driverId")} (${rule.effectivePeriod})`,
  emptyStateTitle: "Belum ada aturan alokasi",
  emptyStateDescription: "Tambahkan aturan yang menghubungkan cost center dengan driver alokasinya.",
};

const TARIFF_STATUS_LABEL: Record<string, string> = { active: "Aktif", superseded: "Diganti" };

function tariffStatusCell(status: string): ReactNode {
  return (
    <span className={status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
      {TARIFF_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const tariffConfig: MasterDataEntityConfig<Tariff, CreateTariffDto> = {
  key: "tariff",
  label: "Tarif",
  permissionPrefix: "tariff",
  api: tariffMasterDataApi,
  defaultSort: "effectiveDate",
  filters: [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "", label: "Semua Status" },
        { value: "active", label: "Aktif" },
        { value: "superseded", label: "Diganti" },
      ],
    },
  ],
  fkLookups: [{ field: "serviceId", fetchMap: serviceLookupMap }],
  columns: [
    { header: "Layanan", render: (row) => fkLabelCell(row, "serviceId") },
    { key: "currentTariff", header: "Tarif Saat Ini", align: "right", render: (row) => formatCurrencyIDR(row.currentTariff) },
    {
      header: "Tarif Rekomendasi",
      align: "right",
      render: (row) => (row.recommendedTariff === null ? "—" : formatCurrencyIDR(row.recommendedTariff)),
    },
    { key: "effectiveDate", header: "Berlaku Sejak", render: (row) => formatDate(row.effectiveDate) },
    { key: "status", header: "Status", render: (row) => tariffStatusCell(row.status) },
  ],
  formFields: [
    {
      name: "serviceId",
      label: "Layanan",
      type: "fk-select",
      required: true,
      fkOptions: fetchServiceOptions,
      fkPlaceholder: "Pilih layanan...",
    },
    { name: "currentTariff", label: "Tarif (Rp)", type: "number", required: true },
    { name: "recommendedTariff", label: "Tarif Rekomendasi (Rp)", type: "number" },
    { name: "effectiveDate", label: "Berlaku Sejak", type: "date", required: true },
  ],
  toFormValues: (tariff) => ({
    serviceId: tariff.serviceId,
    currentTariff: tariff.currentTariff,
    recommendedTariff: tariff.recommendedTariff ?? "",
    effectiveDate: tariff.effectiveDate.slice(0, 10),
  }),
  fromFormValues: (values) => ({
    serviceId: values.serviceId ?? "",
    currentTariff: Number(values.currentTariff ?? 0),
    recommendedTariff: values.recommendedTariff ? Number(values.recommendedTariff) : undefined,
    effectiveDate: values.effectiveDate ?? "",
  }),
  getEntityLabel: (tariff) => `${fkLabelCell(tariff, "serviceId")} — ${formatDate(tariff.effectiveDate)}`,
  emptyStateTitle: "Belum ada data tarif",
  emptyStateDescription: "Tambahkan tarif untuk sebuah layanan — tarif baru otomatis menggantikan tarif aktif sebelumnya.",
};

/**
 * Erased to `any` generics deliberately: this array holds configs for
 * structurally unrelated entities (Driver, ProfitCenter, ...), and each
 * config is already fully type-checked against its own entity/DTO shape at
 * its definition above — TS has no native existential type to express "a
 * heterogeneous list of `MasterDataEntityConfig<X, Y>` for varying X/Y"
 * otherwise. All 12 master-data entities are covered as of Master Data
 * sub-task 3 — `HospitalSettings` is a separate singleton, not in this list
 * (see the Settings page instead, per the confirmed design decision).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
export const masterDataEntities: MasterDataEntityConfig<any, any>[] = [
  driverConfig,
  profitCenterConfig,
  doctorConfig,
  vendorConfig,
  coaAccountConfig,
  costCenterConfig,
  employeeConfig,
  assetConfig,
  bmhpItemConfig,
  serviceConfig,
  allocationRuleConfig,
  tariffConfig,
];
