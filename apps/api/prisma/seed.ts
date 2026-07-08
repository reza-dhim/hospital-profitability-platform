import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * docs/33_TESTING_STRATEGY.md §3: a small but complete fixture hospital
 * ("Rumah Sakit Contoh") for local dev, tests, and demo use. Role permission
 * sets are intentionally empty — populated in Sprint 2 per docs/04_RBAC.md §2.
 */
const DEFAULT_ROLES: Array<{ name: string; description: string; isDefault: boolean }> = [
  { name: "direktur", description: "Direktur Rumah Sakit", isDefault: true },
  { name: "cfo_finance_director", description: "CFO / Finance Director", isDefault: true },
  { name: "tim_costing", description: "Tim Costing", isDefault: true },
  { name: "kepala_unit", description: "Kepala Unit", isDefault: true },
  { name: "manajemen_medis", description: "Manajemen Medis", isDefault: true },
  { name: "system_admin", description: "Admin Sistem", isDefault: true },
];

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Contoh Group",
    },
  });

  const hospital = await prisma.hospital.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "RSC" } },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Rumah Sakit Contoh",
      code: "RSC",
      address: "Jl. Contoh No. 1, Jakarta",
    },
  });

  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { hospitalId_name: { hospitalId: hospital.id, name: role.name } },
      update: {},
      create: {
        hospitalId: hospital.id,
        name: role.name,
        description: role.description,
        isDefault: role.isDefault,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded organization "${organization.name}" with hospital "${hospital.name}" and ${DEFAULT_ROLES.length} default roles.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
