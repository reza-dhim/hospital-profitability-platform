import { UploadType } from "@prisma/client";

/** docs/06_UPLOAD_ENGINE.md §1: "Each template is versioned... so the engine can detect and reject uploads against a stale template." */
export const TEMPLATE_VERSION = "v1";

export interface TemplateColumn {
  /** Visible header text (row 2 of the generated sheet) and the column name the parser (Sprint 4 sub-task 4) matches against. */
  header: string;
  /** Human-readable explanation shown on the "Instruksi" sheet — format, whether it references another entity's `code`, units. */
  description: string;
  /**
   * Example value for the styled example row(s) on the "Data" sheet.
   * Every reference to another entity's `code` (or `period`) is a
   * deliberately fake `CONTOH-*` value, never a real seeded code — so a
   * user who forgets to delete the example row gets a clean, obvious
   * validation error ("code not found") instead of the row silently
   * succeeding and polluting real data (a real risk for insert-only types
   * like asset/employee/bmhp, where only the reference columns, not the
   * row's own new `code`, need to resolve to something that already exists).
   */
  example: string;
}

export interface TemplateSpec {
  columns: TemplateColumn[];
  /** Type-level instructions shown above the column table on the "Instruksi" sheet. */
  notes: string[];
}

const COMMON_NOTES = [
  "Format file: .xlsx saja (bukan .xls atau .csv).",
  "Baris berwarna abu-abu miring di sheet 'Data' adalah CONTOH — hapus baris tersebut sebelum mengunggah data asli.",
  "Sel yang diawali karakter =, +, -, atau @ akan dibaca sebagai teks biasa, bukan formula.",
];

/**
 * One entry per `SUPPORTED_UPLOAD_TYPES` value (`upload.constants.ts`).
 * Columns reference master-data by human-readable *code*, not internal id
 * (`cost_center_code`, not `cost_center_id`) — matches
 * docs/07_VALIDATION_ENGINE.md §2's error taxonomy, which is itself written
 * in terms of codes (`E_INVALID_COST_CENTER`: "cost_center code not found").
 * Shared between `TemplateService` (generation, this sub-task) and the
 * parser (structural validation, Sprint 4 sub-task 4) so the two can never
 * drift apart.
 */
export const TEMPLATE_SPECS: Partial<Record<UploadType, TemplateSpec>> = {
  cost: {
    notes: [...COMMON_NOTES, "period harus sama dengan periode yang dipilih saat memulai unggahan (format YYYY-MM)."],
    columns: [
      { header: "period", description: "Periode fiskal, format YYYY-MM. Harus sama dengan periode target unggahan.", example: "CONTOH-PERIODE" },
      { header: "cost_center_code", description: "Kode cost center tujuan biaya (lihat Master Data > Cost Center).", example: "CONTOH-CC" },
      { header: "coa_account_code", description: "Kode akun COA kategori beban (lihat Master Data > Chart of Accounts).", example: "CONTOH-COA" },
      { header: "nominal", description: "Nominal biaya dalam Rupiah, angka positif tanpa titik/koma pemisah.", example: "450000000" },
    ],
  },
  revenue: {
    notes: [...COMMON_NOTES, "period harus sama dengan periode yang dipilih saat memulai unggahan (format YYYY-MM)."],
    columns: [
      { header: "period", description: "Periode fiskal, format YYYY-MM. Harus sama dengan periode target unggahan.", example: "CONTOH-PERIODE" },
      { header: "profit_center_code", description: "Kode profit center (lihat Master Data > Profit Center).", example: "CONTOH-PC" },
      { header: "service_code", description: "Kode layanan (lihat Master Data > Layanan).", example: "CONTOH-SVC" },
      { header: "volume", description: "Jumlah kasus/kunjungan pada periode ini, angka positif.", example: "850" },
      { header: "revenue", description: "Total pendapatan dalam Rupiah untuk kombinasi layanan + periode ini.", example: "3825000000" },
    ],
  },
  /**
   * Sprint 5 sub-task 0 — feeds the Cost Allocation Engine's driver
   * percentages (docs/08_COST_ALLOCATION_ENGINE.md §2). `target_type` is
   * `cost_center` or `profit_center` (docs/02_DOMAIN_MODEL.md's
   * `driver_values.target_center_id` has no discriminator in the literal
   * schema — `target_type` + `target_code` together replace it, resolved
   * to the real polymorphic FK pair at confirm time).
   */
  driver: {
    notes: [
      ...COMMON_NOTES,
      "period harus sama dengan periode yang dipilih saat memulai unggahan (format YYYY-MM).",
      "target_type harus salah satu dari: cost_center, profit_center.",
    ],
    columns: [
      { header: "period", description: "Periode fiskal, format YYYY-MM. Harus sama dengan periode target unggahan.", example: "CONTOH-PERIODE" },
      { header: "driver_code", description: "Kode driver alokasi (lihat Master Data > Driver).", example: "CONTOH-DRV" },
      { header: "target_type", description: "Jenis target: cost_center atau profit_center.", example: "profit_center" },
      { header: "target_code", description: "Kode cost center atau profit center tujuan, sesuai target_type.", example: "CONTOH-PC" },
      { header: "value", description: "Nilai driver untuk target ini pada periode tersebut (mis. jumlah pegawai, m2 luas area).", example: "45" },
    ],
  },
  /**
   * Master-data upload types (this sub-task) — no `period` column, since
   * Asset/Employee/BmhpItem/Tariff aren't period-scoped entities
   * (`upload_batches.period_id` still gates "is this hospital's data-entry
   * window open", it just isn't written onto the promoted row). Insert-only:
   * a `code` that already exists among live rows is a validation error, not
   * an update — see `row-validation-rules.ts`'s `codeNotExistsRule`.
   */
  asset: {
    notes: [...COMMON_NOTES, "code adalah kode baru milik aset ini (bukan referensi) — pastikan belum pernah dipakai."],
    columns: [
      { header: "code", description: "Kode unik aset baru (belum pernah dipakai).", example: "CONTOH-001" },
      { header: "name", description: "Nama aset.", example: "Contoh Nama Aset" },
      { header: "category", description: "Kategori aset, teks bebas.", example: "Contoh Kategori" },
      { header: "cost_center_code", description: "Kode cost center pemilik aset (lihat Master Data > Cost Center).", example: "CONTOH-CC" },
      { header: "acquisition_cost", description: "Harga perolehan dalam Rupiah.", example: "150000000" },
      { header: "depreciation_method", description: "Metode penyusutan, mis. straight_line.", example: "straight_line" },
      { header: "useful_life_months", description: "Masa manfaat dalam bulan, angka bulat positif.", example: "60" },
    ],
  },
  employee: {
    notes: [...COMMON_NOTES, "code adalah kode baru milik pegawai ini (bukan referensi) — pastikan belum pernah dipakai."],
    columns: [
      { header: "code", description: "Kode unik pegawai baru (belum pernah dipakai).", example: "CONTOH-001" },
      { header: "name", description: "Nama pegawai.", example: "Contoh Nama Pegawai" },
      { header: "role_title", description: "Jabatan/posisi.", example: "Contoh Jabatan" },
      { header: "department_cost_center_code", description: "Kode cost center departemen (lihat Master Data > Cost Center).", example: "CONTOH-CC" },
      { header: "employment_type", description: "Status kepegawaian, mis. tetap atau kontrak.", example: "tetap" },
    ],
  },
  bmhp: {
    notes: [...COMMON_NOTES, "code adalah kode baru milik item BMHP ini (bukan referensi) — pastikan belum pernah dipakai."],
    columns: [
      { header: "code", description: "Kode unik item BMHP baru (belum pernah dipakai).", example: "CONTOH-001" },
      { header: "name", description: "Nama item BMHP.", example: "Contoh Nama BMHP" },
      { header: "unit", description: "Satuan, mis. pcs, box, vial.", example: "pcs" },
      { header: "standard_cost", description: "Harga standar per satuan dalam Rupiah.", example: "25000" },
      { header: "vendor_code", description: "Kode vendor pemasok (lihat Master Data > Vendor).", example: "CONTOH-VND" },
    ],
  },
  /**
   * No `code`/duplicate check — `tariffs` is an append-only history per
   * `service_code` by design (docs/02_DOMAIN_MODEL.md's `tariffs` note).
   * Each valid row is always a new insert that supersedes the prior active
   * tariff for that service, same as `TariffService.create()`.
   */
  tariff: {
    notes: [...COMMON_NOTES, "Setiap baris valid akan menggantikan (supersede) tarif aktif sebelumnya untuk service_code yang sama."],
    columns: [
      { header: "service_code", description: "Kode layanan (lihat Master Data > Layanan).", example: "CONTOH-SVC" },
      { header: "current_tariff", description: "Tarif berlaku dalam Rupiah.", example: "175000" },
      { header: "recommended_tariff", description: "Tarif rekomendasi dalam Rupiah (opsional, boleh dikosongkan).", example: "200000" },
      { header: "effective_date", description: "Tanggal mulai berlaku, format YYYY-MM-DD.", example: "2026-06-01" },
    ],
  },
  /**
   * Sprint 8 prerequisite — period-scoped, append-only case-level data
   * (docs/11_DOCTOR_ANALYTICS.md §2), same pipeline shape as cost/revenue/
   * driver above, not the insert-only master-data shape used by
   * asset/employee/bmhp/tariff. One row = one activity/case instance —
   * many rows legitimately share the same period+service_code+doctor_code,
   * which is why there's no natural-key duplicate check for this type
   * (row-validation-rules.ts).
   */
  medical_activity: {
    notes: [
      ...COMMON_NOTES,
      "period harus sama dengan periode yang dipilih saat memulai unggahan (format YYYY-MM).",
      "Satu baris = satu kasus/aktivitas. Beberapa baris boleh punya period+service_code+doctor_code yang sama.",
    ],
    columns: [
      { header: "period", description: "Periode fiskal, format YYYY-MM. Harus sama dengan periode target unggahan.", example: "CONTOH-PERIODE" },
      { header: "service_code", description: "Kode layanan (lihat Master Data > Layanan).", example: "CONTOH-SVC" },
      { header: "doctor_code", description: "Kode dokter (lihat Master Data > Dokter).", example: "CONTOH-DOC" },
      { header: "volume", description: "Jumlah kasus pada baris ini (biasanya 1).", example: "1" },
      { header: "duration_minutes", description: "Durasi tindakan dalam menit.", example: "30" },
      { header: "bmhp_cost", description: "Biaya BMHP untuk kasus ini dalam Rupiah.", example: "500000" },
      { header: "room_cost", description: "Biaya ruangan untuk kasus ini dalam Rupiah.", example: "300000" },
      { header: "staff_cost", description: "Biaya staf/tenaga untuk kasus ini dalam Rupiah.", example: "200000" },
      { header: "revenue", description: "Pendapatan untuk kasus ini dalam Rupiah.", example: "250000" },
    ],
  },
};
