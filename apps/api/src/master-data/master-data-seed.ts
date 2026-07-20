import type { PrismaClient } from "@prisma/client";

/**
 * Seeds a small but realistic Sprint 3 master-data fixture (13 entities +
 * hospital_settings) for a single hospital — Indonesian hospital terminology
 * throughout, so it reads naturally for demo/UAT. Framework-free (plain
 * `PrismaClient`, not a Nest injectable), same convention as
 * `src/rbac/rbac-seed.ts`, so it can run from `prisma/seed.ts`.
 *
 * Safe to call repeatedly: every write is an upsert keyed on each entity's
 * natural unique constraint (`hospitalId` + `code`, or the compound key for
 * `AllocationRule`). `Tariff` has no natural unique constraint (it's an
 * append-only history table by design — docs/02_DOMAIN_MODEL.md `tariffs`
 * note) so its rows are upserted by a fixed seed-only id instead.
 */
export async function seedDemoMasterData(prisma: PrismaClient, hospitalId: string, actorUserId: string): Promise<void> {
  await prisma.hospitalSettings.upsert({
    where: { hospitalId },
    update: {},
    create: {
      hospitalId,
      allocationMethod: "step_down",
      defaultTargetMargin: 15,
      fiscalYearStartMonth: 1,
      locale: "id-ID",
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });

  const costCenterId = await upsertByCode(prisma.costCenter as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    { code: "CC-HRD", name: "HRD (Sumber Daya Manusia)", type: "indirect" },
    { code: "CC-IT", name: "Instalasi Teknologi Informasi", type: "indirect" },
    { code: "CC-IPSRS", name: "IPSRS (Pemeliharaan Sarana & Prasarana)", type: "indirect" },
    { code: "CC-LND", name: "Laundry", type: "indirect" },
    { code: "CC-GIZI", name: "Instalasi Gizi/Dapur", type: "indirect" },
  ]);

  const profitCenterId = await upsertByCode(prisma.profitCenter as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    { code: "PC-RJ", name: "Rawat Jalan", department: "Pelayanan Medis" },
    { code: "PC-RI1", name: "Rawat Inap Kelas 1", department: "Pelayanan Medis" },
    { code: "PC-IGD", name: "Instalasi Gawat Darurat (IGD)", department: "Pelayanan Medis" },
    { code: "PC-LAB", name: "Laboratorium", department: "Penunjang Medis" },
    { code: "PC-RAD", name: "Radiologi", department: "Penunjang Medis" },
    { code: "PC-FARM", name: "Instalasi Farmasi", department: "Penunjang Medis" },
  ]);

  const driverId = await upsertByCode(prisma.driver as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    {
      code: "DRV-PEGAWAI",
      name: "Jumlah Pegawai",
      unit: "orang",
      description: "Jumlah pegawai per unit, dipakai untuk alokasi biaya HRD.",
    },
    {
      code: "DRV-LUAS",
      name: "Luas Area",
      unit: "m2",
      description: "Luas area per unit, dipakai untuk alokasi biaya laundry dan kebersihan.",
    },
    {
      code: "DRV-PERANGKAT",
      name: "Jumlah Perangkat IT",
      unit: "unit",
      description: "Jumlah perangkat komputer/IT per unit, dipakai untuk alokasi biaya IT.",
    },
  ]);

  await upsertByCode(prisma.coaAccount as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    { code: "1-1000", name: "Kas dan Setara Kas", category: "asset" },
    { code: "1-1300", name: "Persediaan Obat dan BMHP", category: "asset" },
    { code: "4-1000", name: "Pendapatan Rawat Jalan", category: "revenue" },
    { code: "4-2000", name: "Pendapatan Rawat Inap", category: "revenue" },
    { code: "5-1000", name: "Beban Gaji dan Tunjangan Karyawan", category: "expense" },
    { code: "5-2000", name: "Beban Bahan Medis Habis Pakai", category: "expense" },
  ]);

  await upsertByCode(prisma.doctor as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    { code: "DOC-001", name: "dr. Andi Wijaya, Sp.PD", specialty: "Penyakit Dalam" },
    { code: "DOC-002", name: "dr. Siti Rahayu, Sp.A", specialty: "Anak" },
    { code: "DOC-003", name: "dr. Bambang Kusuma, Sp.B", specialty: "Bedah Umum" },
    { code: "DOC-004", name: "dr. Dewi Lestari, Sp.OG", specialty: "Obstetri dan Ginekologi" },
  ]);

  const vendorId = await upsertByCode(prisma.vendor as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    { code: "VND-001", name: "PT Sumber Medika Farma", category: "BMHP Supplier" },
    { code: "VND-002", name: "PT Alkes Nusantara Sejahtera", category: "Alat Kesehatan Supplier" },
    { code: "VND-003", name: "PT Distribusi Farmasi Prima", category: "Obat & Farmasi Supplier" },
  ]);

  // docs/08_COST_ALLOCATION_ENGINE.md §2 — links a cost center's pool to the
  // driver used to spread it. Two rules is enough to exercise both `method`
  // values seen in the AllocationMethod vocabulary.
  await prisma.allocationRule.upsert({
    where: {
      costCenterId_driverId_effectivePeriod: {
        costCenterId: costCenterId.get("CC-HRD")!,
        driverId: driverId.get("DRV-PEGAWAI")!,
        effectivePeriod: "2026-01",
      },
    },
    update: {},
    create: {
      hospitalId,
      costCenterId: costCenterId.get("CC-HRD")!,
      driverId: driverId.get("DRV-PEGAWAI")!,
      method: "step_down",
      priority: 1,
      effectivePeriod: "2026-01",
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });
  await prisma.allocationRule.upsert({
    where: {
      costCenterId_driverId_effectivePeriod: {
        costCenterId: costCenterId.get("CC-IT")!,
        driverId: driverId.get("DRV-PERANGKAT")!,
        effectivePeriod: "2026-01",
      },
    },
    update: {},
    create: {
      hospitalId,
      costCenterId: costCenterId.get("CC-IT")!,
      driverId: driverId.get("DRV-PERANGKAT")!,
      method: "direct",
      priority: 2,
      effectivePeriod: "2026-01",
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });

  const serviceId = await upsertByCode(
    prisma.service as unknown as UpsertByCodeDelegate,
    hospitalId,
    actorUserId,
    [
      {
        code: "SVC-001",
        name: "Konsultasi Poli Penyakit Dalam",
        profitCenterId: profitCenterId.get("PC-RJ")!,
        serviceType: "rawat_jalan",
        standardDuration: 20,
      },
      {
        code: "SVC-002",
        name: "Rawat Inap Kelas 1 per Hari",
        profitCenterId: profitCenterId.get("PC-RI1")!,
        serviceType: "rawat_inap",
      },
      {
        code: "SVC-003",
        name: "Pemeriksaan Darah Lengkap",
        profitCenterId: profitCenterId.get("PC-LAB")!,
        serviceType: "penunjang_medis",
        standardDuration: 15,
      },
      {
        code: "SVC-004",
        name: "Rontgen Thorax",
        profitCenterId: profitCenterId.get("PC-RAD")!,
        serviceType: "penunjang_medis",
        standardDuration: 15,
      },
      {
        code: "SVC-005",
        name: "Racikan Obat Non-Generik",
        profitCenterId: profitCenterId.get("PC-FARM")!,
        serviceType: "farmasi",
        standardDuration: 10,
      },
    ]
  );

  await upsertByCode(prisma.employee as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    { code: "EMP-001", name: "Rina Marlina", roleTitle: "Staff HRD", departmentCostCenterId: costCenterId.get("CC-HRD"), employmentType: "tetap" },
    { code: "EMP-002", name: "Fajar Nugroho", roleTitle: "Staff IT", departmentCostCenterId: costCenterId.get("CC-IT"), employmentType: "tetap" },
    { code: "EMP-003", name: "Yulianti Putri", roleTitle: "Perawat Rawat Inap", employmentType: "tetap" },
    { code: "EMP-004", name: "Agus Setiawan", roleTitle: "Teknisi IPSRS", departmentCostCenterId: costCenterId.get("CC-IPSRS"), employmentType: "tetap" },
    { code: "EMP-005", name: "Maya Sari", roleTitle: "Staff Laundry", departmentCostCenterId: costCenterId.get("CC-LND"), employmentType: "kontrak" },
  ]);

  await upsertByCode(prisma.asset as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    {
      code: "AST-001",
      name: "USG Machine GE Voluson",
      category: "medical-equipment",
      acquisitionCost: 250_000_000,
      depreciationMethod: "straight-line",
      usefulLifeMonths: 60,
    },
    {
      code: "AST-002",
      name: "Mesin Cuci Industrial",
      category: "laundry-equipment",
      costCenterId: costCenterId.get("CC-LND"),
      acquisitionCost: 85_000_000,
      depreciationMethod: "straight-line",
      usefulLifeMonths: 84,
    },
    {
      code: "AST-003",
      name: "Server & Perangkat Jaringan IT",
      category: "it-equipment",
      costCenterId: costCenterId.get("CC-IT"),
      acquisitionCost: 120_000_000,
      depreciationMethod: "straight-line",
      usefulLifeMonths: 48,
    },
    {
      code: "AST-004",
      name: "Genset Cadangan 100kVA",
      category: "facility-equipment",
      costCenterId: costCenterId.get("CC-IPSRS"),
      acquisitionCost: 300_000_000,
      depreciationMethod: "straight-line",
      usefulLifeMonths: 120,
    },
  ]);

  await upsertByCode(prisma.bmhpItem as unknown as UpsertByCodeDelegate, hospitalId, actorUserId, [
    { code: "BMHP-001", name: "Sarung Tangan Steril", unit: "box", standardCost: 45_000, vendorId: vendorId.get("VND-002") },
    { code: "BMHP-002", name: "Kasa Steril", unit: "box", standardCost: 25_000, vendorId: vendorId.get("VND-001") },
    { code: "BMHP-003", name: "Masker Bedah", unit: "box", standardCost: 30_000, vendorId: vendorId.get("VND-001") },
    { code: "BMHP-004", name: "Infus Set", unit: "pcs", standardCost: 12_000, vendorId: vendorId.get("VND-002") },
    // Demonstrates the `status` filter — a discontinued item, distinct from the rest.
    { code: "BMHP-005", name: "Spuit / Syringe 5ml", unit: "pcs", standardCost: 2_500, vendorId: vendorId.get("VND-002"), status: "inactive" as const },
  ]);

  // Tariff is an append-only history table with no natural unique constraint
  // (docs/02_DOMAIN_MODEL.md `tariffs` note), so — unlike every other entity
  // above — these rows are upserted by a fixed seed-only id rather than a
  // business key. SVC-001 gets two rows (an old "superseded" one and the
  // current "active" one) to demonstrate the supersede history the real
  // `TariffService.create()` maintains; the rest get a single active row.
  // `Service.currentTariff` is updated afterward to mirror what
  // `TariffService.create()` keeps in sync at write time.
  const tariffSeeds: {
    id: string;
    serviceCode: string;
    currentTariff: number;
    recommendedTariff?: number;
    effectiveDate: string;
    status: "active" | "superseded";
  }[] = [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      serviceCode: "SVC-001",
      currentTariff: 150_000,
      effectiveDate: "2025-01-01",
      status: "superseded",
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      serviceCode: "SVC-001",
      currentTariff: 175_000,
      recommendedTariff: 185_000,
      effectiveDate: "2026-01-01",
      status: "active",
    },
    {
      id: "a0000000-0000-0000-0000-000000000003",
      serviceCode: "SVC-002",
      currentTariff: 750_000,
      recommendedTariff: 800_000,
      effectiveDate: "2026-01-01",
      status: "active",
    },
    {
      id: "a0000000-0000-0000-0000-000000000004",
      serviceCode: "SVC-003",
      currentTariff: 120_000,
      effectiveDate: "2026-01-01",
      status: "active",
    },
    {
      id: "a0000000-0000-0000-0000-000000000005",
      serviceCode: "SVC-004",
      currentTariff: 175_000,
      recommendedTariff: 190_000,
      effectiveDate: "2026-01-01",
      status: "active",
    },
    {
      id: "a0000000-0000-0000-0000-000000000006",
      serviceCode: "SVC-005",
      currentTariff: 85_000,
      effectiveDate: "2026-01-01",
      status: "active",
    },
  ];

  for (const seed of tariffSeeds) {
    const svcId = serviceId.get(seed.serviceCode)!;
    await prisma.tariff.upsert({
      where: { id: seed.id },
      update: {
        currentTariff: seed.currentTariff,
        recommendedTariff: seed.recommendedTariff,
        effectiveDate: new Date(seed.effectiveDate),
        status: seed.status,
        updatedByUserId: actorUserId,
      },
      create: {
        id: seed.id,
        hospitalId,
        serviceId: svcId,
        currentTariff: seed.currentTariff,
        recommendedTariff: seed.recommendedTariff,
        effectiveDate: new Date(seed.effectiveDate),
        approvedByUserId: actorUserId,
        approvedAt: new Date(seed.effectiveDate),
        status: seed.status,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });

    if (seed.status === "active") {
      await prisma.service.update({
        where: { id: svcId },
        data: { currentTariff: seed.currentTariff },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded demo master data: ${costCenterId.size} cost centers, ${profitCenterId.size} profit centers, ` +
      `${driverId.size} drivers, ${vendorId.size} vendors, ${serviceId.size} services, ` +
      `${tariffSeeds.length} tariff rows (incl. 1 supersede history), plus COA accounts, doctors, employees, assets, and BMHP items.`
  );
}

/**
 * The subset of a Prisma model delegate this helper needs. Typed with `args:
 * unknown` deliberately — same rationale as `CrudDelegate` in
 * `common/crud/master-data-crud.service.ts`: each concrete Prisma delegate
 * has its own generated, model-specific `upsert` argument type, and there is
 * no shared supertype for "any Prisma model delegate" to structurally match.
 * Callers cast with `as unknown as UpsertByCodeDelegate` at the call site.
 */
interface UpsertByCodeDelegate {
  upsert(args: unknown): Promise<{ id: string }>;
}

/**
 * Upserts a batch of rows keyed on this entity's `@@unique([hospitalId, code])`
 * constraint — the shared natural key every master-data entity except
 * `AllocationRule` (compound key) and `Tariff` (no natural key) uses. Returns
 * a `code -> id` map so callers can wire up FK references (e.g. `Employee.
 * departmentCostCenterId`) without a second round-trip.
 */
async function upsertByCode<TRow extends { code: string; status?: "active" | "inactive" }>(
  delegate: UpsertByCodeDelegate,
  hospitalId: string,
  actorUserId: string,
  rows: TRow[]
): Promise<Map<string, string>> {
  const idByCode = new Map<string, string>();
  for (const row of rows) {
    const { code, ...rest } = row;
    const result = await delegate.upsert({
      where: { hospitalId_code: { hospitalId, code } },
      update: { ...rest },
      create: { hospitalId, code, ...rest, createdByUserId: actorUserId, updatedByUserId: actorUserId },
    });
    idByCode.set(code, result.id);
  }
  return idByCode;
}
