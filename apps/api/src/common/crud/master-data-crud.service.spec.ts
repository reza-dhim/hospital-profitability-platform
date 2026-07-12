import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditContextService } from "../../audit/audit-context.service";
import type { ListQueryOptions } from "../query/list-query.util";
import type { PaginationMetaDto } from "../dto/pagination.dto";

import { CostCenterService } from "../../master-data/cost-center/cost-center.service";
import { ProfitCenterService } from "../../master-data/profit-center/profit-center.service";
import { DriverService } from "../../master-data/driver/driver.service";
import { AllocationRuleService } from "../../master-data/allocation-rule/allocation-rule.service";
import { CoaAccountService } from "../../master-data/coa-account/coa-account.service";
import { DoctorService } from "../../master-data/doctor/doctor.service";
import { MedicalServiceService } from "../../master-data/service/service.service";
import { EmployeeService } from "../../master-data/employee/employee.service";
import { AssetService } from "../../master-data/asset/asset.service";
import { VendorService } from "../../master-data/vendor/vendor.service";
import { BmhpItemService } from "../../master-data/bmhp-item/bmhp-item.service";
import { TariffService } from "../../master-data/tariff/tariff.service";

/**
 * Parameterized contract test for `MasterDataCrudService` (docs/33_TESTING_STRATEGY.md
 * §2 "Master Data CRUD" mandate: one shared suite exercised against every
 * entity, so a new entity is added to the table below rather than given a
 * bespoke copy of these tests). Covers create/find/update/soft-delete,
 * search/filter/sort/pagination scoping, and audit-context recording — the
 * mechanism `MasterDataCrudService` implements once for all 12 entities that
 * extend it (`HospitalSettings` is a hand-written singleton, not one of them,
 * per common/crud/master-data-crud.service.ts's own doc comment).
 *
 * Unit-level only: the Prisma delegate and `AuditContextService` are mocked
 * (same convention as auth/tenancy specs — no `TestingModule`, no real DB).
 * `Tariff` is included here for its inherited findAll/findOne/update/remove
 * behavior, but excluded from the `create` cases below since it overrides
 * `create()` entirely (covered separately in tariff.service.spec.ts).
 */

interface FieldConfigCase {
  searchableFields: string[];
  filterableFields: string[];
  sortableFields: string[];
  defaultSort: string;
}

/** The subset of `MasterDataCrudService`'s public surface these tests exercise, typed loosely (no `any`) since each concrete subclass fixes its own entity/DTO generics. */
interface CrudUnderTest {
  create(hospitalId: string, dto: Record<string, unknown>, actorUserId: string): Promise<{ id: string }>;
  findAll(hospitalId: string, query: ListQueryOptions): Promise<{ data: unknown[]; meta: PaginationMetaDto }>;
  findOne(hospitalId: string, id: string): Promise<{ id: string }>;
  update(hospitalId: string, id: string, dto: Record<string, unknown>, actorUserId: string): Promise<{ id: string }>;
  remove(hospitalId: string, id: string, actorUserId: string): Promise<void>;
}

interface EntityCase {
  label: string;
  prismaKey: string;
  entity: string;
  notFoundCode: string;
  conflictCode: string;
  conflictMessage?: string;
  fieldConfig: FieldConfigCase;
  includeInCreateSuite: boolean;
  makeInstance: (prisma: PrismaService, auditContextService: AuditContextService) => CrudUnderTest;
}

const CASES: EntityCase[] = [
  {
    label: "CostCenter",
    prismaKey: "costCenter",
    entity: "cost_center",
    notFoundCode: "COST_CENTER_NOT_FOUND",
    conflictCode: "COST_CENTER_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["type", "status"],
      sortableFields: ["code", "name", "type", "status", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new CostCenterService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "ProfitCenter",
    prismaKey: "profitCenter",
    entity: "profit_center",
    notFoundCode: "PROFIT_CENTER_NOT_FOUND",
    conflictCode: "PROFIT_CENTER_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["department", "status"],
      sortableFields: ["code", "name", "department", "status", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new ProfitCenterService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "Driver",
    prismaKey: "driver",
    entity: "driver",
    notFoundCode: "DRIVER_NOT_FOUND",
    conflictCode: "DRIVER_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["unit"],
      sortableFields: ["code", "name", "unit", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new DriverService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "AllocationRule",
    prismaKey: "allocationRule",
    entity: "allocation_rule",
    notFoundCode: "ALLOCATION_RULE_NOT_FOUND",
    conflictCode: "ALLOCATION_RULE_DUPLICATE",
    conflictMessage: "An allocation rule for this cost center, driver, and period already exists.",
    fieldConfig: {
      searchableFields: ["effectivePeriod"],
      filterableFields: ["costCenterId", "driverId", "effectivePeriod", "method"],
      sortableFields: ["priority", "effectivePeriod", "createdAt", "updatedAt"],
      defaultSort: "priority",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new AllocationRuleService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "CoaAccount",
    prismaKey: "coaAccount",
    entity: "coa_account",
    notFoundCode: "COA_ACCOUNT_NOT_FOUND",
    conflictCode: "COA_ACCOUNT_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["category"],
      sortableFields: ["code", "name", "category", "createdAt", "updatedAt"],
      defaultSort: "code",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new CoaAccountService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "Doctor",
    prismaKey: "doctor",
    entity: "doctor",
    notFoundCode: "DOCTOR_NOT_FOUND",
    conflictCode: "DOCTOR_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name", "specialty"],
      filterableFields: ["specialty", "status"],
      sortableFields: ["code", "name", "specialty", "status", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new DoctorService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "Service",
    prismaKey: "service",
    entity: "service",
    notFoundCode: "SERVICE_NOT_FOUND",
    conflictCode: "SERVICE_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["profitCenterId", "serviceType"],
      sortableFields: ["code", "name", "serviceType", "standardDuration", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new MedicalServiceService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "Employee",
    prismaKey: "employee",
    entity: "employee",
    notFoundCode: "EMPLOYEE_NOT_FOUND",
    conflictCode: "EMPLOYEE_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["departmentCostCenterId", "employmentType", "status"],
      sortableFields: ["code", "name", "employmentType", "status", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new EmployeeService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "Asset",
    prismaKey: "asset",
    entity: "asset",
    notFoundCode: "ASSET_NOT_FOUND",
    conflictCode: "ASSET_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["category", "costCenterId", "status"],
      sortableFields: ["code", "name", "category", "acquisitionCost", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new AssetService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "Vendor",
    prismaKey: "vendor",
    entity: "vendor",
    notFoundCode: "VENDOR_NOT_FOUND",
    conflictCode: "VENDOR_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["category", "status"],
      sortableFields: ["code", "name", "category", "status", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new VendorService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "BmhpItem",
    prismaKey: "bmhpItem",
    entity: "bmhp_item",
    notFoundCode: "BMHP_ITEM_NOT_FOUND",
    conflictCode: "BMHP_ITEM_CODE_TAKEN",
    fieldConfig: {
      searchableFields: ["code", "name"],
      filterableFields: ["vendorId", "status"],
      sortableFields: ["code", "name", "standardCost", "createdAt", "updatedAt"],
      defaultSort: "name",
    },
    includeInCreateSuite: true,
    makeInstance: (prisma, audit) => new BmhpItemService(prisma, audit) as unknown as CrudUnderTest,
  },
  {
    label: "Tariff",
    prismaKey: "tariff",
    entity: "tariff",
    notFoundCode: "TARIFF_NOT_FOUND",
    conflictCode: "TARIFF_DUPLICATE",
    fieldConfig: {
      searchableFields: [],
      filterableFields: ["serviceId", "status"],
      sortableFields: ["effectiveDate", "currentTariff", "createdAt", "updatedAt"],
      defaultSort: "effectiveDate",
    },
    // TariffService overrides create() (supersede + Service.currentTariff sync) — covered in tariff.service.spec.ts instead.
    includeInCreateSuite: false,
    makeInstance: (prisma, audit) => new TariffService(prisma, audit) as unknown as CrudUnderTest,
  },
];

const SAMPLE_CREATE_DTO = { code: "TEST-001", name: "Test Entity" };
const SAMPLE_UPDATE_DTO = { name: "Updated Name" };

function makeDelegate() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
}

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

function makeService(entityCase: EntityCase) {
  const delegate = makeDelegate();
  const prisma = { [entityCase.prismaKey]: delegate } as unknown as PrismaService;
  const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
  const service = entityCase.makeInstance(prisma, auditContextService);
  return { service, delegate, auditContextService };
}

describe.each(CASES)("$label (generic CRUD engine)", (entityCase) => {
  describe("findAll", () => {
    it("scopes to hospitalId + non-deleted rows, with default pagination", async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);

      await service.findAll("hospital-1", { page: 1, limit: 20 });

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: { hospitalId: "hospital-1", deletedAt: null },
        orderBy: { [entityCase.fieldConfig.defaultSort]: "asc" },
        skip: 0,
        take: 20,
      });
    });

    const { searchableFields } = entityCase.fieldConfig;
    it(
      searchableFields.length > 0
        ? "applies ?search= as a case-insensitive OR across the searchable fields"
        : "ignores ?search= (this entity has no searchable fields)",
      async () => {
        const { service, delegate } = makeService(entityCase);
        delegate.findMany.mockResolvedValue([]);
        delegate.count.mockResolvedValue(0);

        await service.findAll("hospital-1", { page: 1, limit: 20, search: "term" });

        const { where } = delegate.findMany.mock.calls[0][0];
        if (searchableFields.length > 0) {
          expect(where.OR).toEqual(
            searchableFields.map((field) => ({ [field]: { contains: "term", mode: "insensitive" } }))
          );
        } else {
          expect(where.OR).toBeUndefined();
        }
      }
    );

    it("applies an allow-listed ?filter[x]= and silently ignores a key not in filterableFields", async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);
      const allowedField = entityCase.fieldConfig.filterableFields[0]!;

      await service.findAll("hospital-1", {
        page: 1,
        limit: 20,
        filter: { [allowedField]: "value", notAllowlistedField: "should-be-ignored" },
      });

      const { where } = delegate.findMany.mock.calls[0][0];
      expect(where[allowedField]).toBe("value");
      expect(where.notAllowlistedField).toBeUndefined();
    });

    it("sorts descending on an allow-listed field, and falls back to defaultSort ascending for an unknown one", async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);
      const { sortableFields, defaultSort } = entityCase.fieldConfig;
      const sortField = sortableFields.find((field) => field !== defaultSort) ?? sortableFields[0]!;

      await service.findAll("hospital-1", { page: 1, limit: 20, sort: `-${sortField}` });
      expect(delegate.findMany.mock.calls[0][0].orderBy).toEqual({ [sortField]: "desc" });

      await service.findAll("hospital-1", { page: 1, limit: 20, sort: "not-a-real-field" });
      expect(delegate.findMany.mock.calls[1][0].orderBy).toEqual({ [defaultSort]: "asc" });
    });

    it("computes skip/take from page/limit and returns the {data, meta} envelope", async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findMany.mockResolvedValue([{ id: "row-1" }]);
      delegate.count.mockResolvedValue(41);

      const result = await service.findAll("hospital-1", { page: 3, limit: 10 });

      expect(delegate.findMany.mock.calls[0][0]).toEqual(expect.objectContaining({ skip: 20, take: 10 }));
      expect(result).toEqual({ data: [{ id: "row-1" }], meta: { page: 3, limit: 10, total: 41 } });
    });
  });

  describe("findOne", () => {
    it("returns the row scoped to hospitalId + not-deleted", async () => {
      const { service, delegate } = makeService(entityCase);
      const row = { id: "row-1", hospitalId: "hospital-1" };
      delegate.findFirst.mockResolvedValue(row);

      await expect(service.findOne("hospital-1", "row-1")).resolves.toBe(row);
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: "row-1", hospitalId: "hospital-1", deletedAt: null },
      });
    });

    it(`throws NotFoundException with code ${entityCase.notFoundCode} when the row doesn't exist in this hospital`, async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findFirst.mockResolvedValue(null);

      const error = await service.findOne("hospital-1", "missing").catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({ code: entityCase.notFoundCode });
    });
  });

  describe("update", () => {
    it("loads the existing row, forwards the dto + updatedByUserId, and records a before/after audit diff", async () => {
      const { service, delegate, auditContextService } = makeService(entityCase);
      const before = { id: "row-1", hospitalId: "hospital-1" };
      const after = { id: "row-1", hospitalId: "hospital-1", ...SAMPLE_UPDATE_DTO };
      delegate.findFirst.mockResolvedValue(before);
      delegate.update.mockResolvedValue(after);

      const result = await service.update("hospital-1", "row-1", SAMPLE_UPDATE_DTO, "actor-1");

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: "row-1", hospitalId: "hospital-1", deletedAt: null },
      });
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: "row-1" },
        data: { ...SAMPLE_UPDATE_DTO, updatedByUserId: "actor-1" },
      });
      expect(result).toBe(after);
      expect(auditContextService.record).toHaveBeenCalledWith({
        entity: entityCase.entity,
        action: `${entityCase.entity}.update`,
        entityId: "row-1",
        before,
        after,
      });
    });

    it(`propagates NotFoundException(${entityCase.notFoundCode}) without calling update when the row doesn't exist`, async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findFirst.mockResolvedValue(null);

      await expect(service.update("hospital-1", "missing", SAMPLE_UPDATE_DTO, "actor-1")).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it(`throws ConflictException with code ${entityCase.conflictCode} on a unique-constraint violation`, async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findFirst.mockResolvedValue({ id: "row-1", hospitalId: "hospital-1" });
      delegate.update.mockRejectedValue(uniqueConstraintError());

      const error = await service
        .update("hospital-1", "row-1", SAMPLE_UPDATE_DTO, "actor-1")
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse() as { code: string; message: string };
      expect(response.code).toBe(entityCase.conflictCode);
      if (entityCase.conflictMessage) {
        expect(response.message).toBe(entityCase.conflictMessage);
      }
    });
  });

  describe("remove", () => {
    it("soft-deletes (an update setting deletedAt, never a real delete) and records audit", async () => {
      const { service, delegate, auditContextService } = makeService(entityCase);
      const before = { id: "row-1", hospitalId: "hospital-1", deletedAt: null };
      const after = { ...before, deletedAt: new Date() };
      delegate.findFirst.mockResolvedValue(before);
      delegate.update.mockResolvedValue(after);

      await service.remove("hospital-1", "row-1", "actor-1");

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: "row-1" },
        data: { deletedAt: expect.any(Date), updatedByUserId: "actor-1" },
      });
      expect(auditContextService.record).toHaveBeenCalledWith({
        entity: entityCase.entity,
        action: `${entityCase.entity}.delete`,
        entityId: "row-1",
        before,
        after,
      });
    });

    it(`propagates NotFoundException(${entityCase.notFoundCode}) without calling update when the row doesn't exist`, async () => {
      const { service, delegate } = makeService(entityCase);
      delegate.findFirst.mockResolvedValue(null);

      await expect(service.remove("hospital-1", "missing", "actor-1")).rejects.toBeInstanceOf(NotFoundException);
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  if (entityCase.includeInCreateSuite) {
    describe("create", () => {
      it("attaches hospitalId/createdByUserId/updatedByUserId, returns the created row, and records audit", async () => {
        const { service, delegate, auditContextService } = makeService(entityCase);
        const created = { id: "new-1", ...SAMPLE_CREATE_DTO };
        delegate.create.mockResolvedValue(created);

        const result = await service.create("hospital-1", SAMPLE_CREATE_DTO, "actor-1");

        expect(delegate.create).toHaveBeenCalledWith({
          data: { ...SAMPLE_CREATE_DTO, hospitalId: "hospital-1", createdByUserId: "actor-1", updatedByUserId: "actor-1" },
        });
        expect(result).toBe(created);
        expect(auditContextService.record).toHaveBeenCalledWith({
          entity: entityCase.entity,
          action: `${entityCase.entity}.create`,
          entityId: "new-1",
          before: null,
          after: created,
        });
      });

      it(`throws ConflictException with code ${entityCase.conflictCode} on a unique-constraint violation`, async () => {
        const { service, delegate } = makeService(entityCase);
        delegate.create.mockRejectedValue(uniqueConstraintError());

        const error = await service
          .create("hospital-1", SAMPLE_CREATE_DTO, "actor-1")
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ConflictException);
        const response = (error as ConflictException).getResponse() as { code: string; message: string };
        expect(response.code).toBe(entityCase.conflictCode);
        if (entityCase.conflictMessage) {
          expect(response.message).toBe(entityCase.conflictMessage);
        }
      });
    });
  }
});

describe("MasterDataCrudService.create — default conflict message (spot check)", () => {
  it("falls back to '{Humanized Entity} code already exists.' when no conflictMessage override is configured", async () => {
    const delegate = makeDelegate();
    const prisma = { costCenter: delegate } as unknown as PrismaService;
    const auditContextService = { record: jest.fn() } as unknown as AuditContextService;
    delegate.create.mockRejectedValue(uniqueConstraintError());

    const service = new CostCenterService(prisma, auditContextService) as unknown as CrudUnderTest;
    const error = await service.create("hospital-1", SAMPLE_CREATE_DTO, "actor-1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: "COST_CENTER_CODE_TAKEN",
      message: "Cost Center code already exists.",
    });
  });
});
