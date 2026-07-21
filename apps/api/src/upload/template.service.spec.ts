import ExcelJS from "exceljs";
import { NotFoundException } from "@nestjs/common";
import { TemplateService } from "./template.service";
import { TEMPLATE_VERSION } from "./template-specs";

describe("TemplateService", () => {
  const service = new TemplateService();

  it("generates a cost template with a hidden version row and the documented columns", async () => {
    const buffer = await service.generate("cost");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    expect(sheet.getRow(1).getCell(1).value).toBe(`TEMPLATE_VERSION:${TEMPLATE_VERSION}`);
    expect(sheet.getRow(1).hidden).toBe(true);

    const headerValues = [1, 2, 3, 4].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual(["period", "cost_center_code", "coa_account_code", "nominal"]);
  });

  it("generates a revenue template with its documented columns", async () => {
    const buffer = await service.generate("revenue");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const headerValues = [1, 2, 3, 4, 5].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual(["period", "profit_center_code", "service_code", "volume", "revenue"]);
  });

  it("generates a driver template with its documented columns", async () => {
    const buffer = await service.generate("driver");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const headerValues = [1, 2, 3, 4, 5].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual(["period", "driver_code", "target_type", "target_code", "value"]);
  });

  it("generates an asset template with its documented columns", async () => {
    const buffer = await service.generate("asset");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const headerValues = [1, 2, 3, 4, 5, 6, 7].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual([
      "code",
      "name",
      "category",
      "cost_center_code",
      "acquisition_cost",
      "depreciation_method",
      "useful_life_months",
    ]);
  });

  it("generates an employee template with its documented columns", async () => {
    const buffer = await service.generate("employee");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const headerValues = [1, 2, 3, 4, 5].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual(["code", "name", "role_title", "department_cost_center_code", "employment_type"]);
  });

  it("generates a bmhp template with its documented columns", async () => {
    const buffer = await service.generate("bmhp");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const headerValues = [1, 2, 3, 4, 5].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual(["code", "name", "unit", "standard_cost", "vendor_code"]);
  });

  it("generates a tariff template with its documented columns (no code — append-only history)", async () => {
    const buffer = await service.generate("tariff");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const headerValues = [1, 2, 3, 4].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual(["service_code", "current_tariff", "recommended_tariff", "effective_date"]);
  });

  it("generates a medical_activity template with its documented columns", async () => {
    const buffer = await service.generate("medical_activity");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const headerValues = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((col) => sheet.getRow(2).getCell(col).value);
    expect(headerValues).toEqual([
      "period",
      "service_code",
      "doctor_code",
      "volume",
      "duration_minutes",
      "bmhp_cost",
      "room_cost",
      "staff_cost",
      "revenue",
    ]);
  });

  it("includes an 'Instruksi' sheet with type-level notes and a column reference table", async () => {
    const buffer = await service.generate("cost");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Instruksi")!;

    expect(sheet).toBeDefined();
    const allText = sheet
      .getSheetValues()
      .flat()
      .filter((v): v is string => typeof v === "string")
      .join(" ");
    expect(allText).toContain(".xlsx");
    expect(allText).toContain("cost_center_code");
    expect(allText).toContain("Kode cost center tujuan biaya");
  });

  it("writes a styled example row on the Data sheet that a real upload row would overwrite, with a deliberately fake (non-existent) reference code", async () => {
    const buffer = await service.generate("cost");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    const exampleRow = sheet.getRow(3);
    expect(exampleRow.getCell(1).value).toBe("CONTOH-PERIODE");
    expect(exampleRow.getCell(2).value).toBe("CONTOH-CC");
    expect(exampleRow.getCell(1).font?.italic).toBe(true);
    // A 5th cell (beyond the 4 real "cost" columns) carries a human note —
    // the parser only reads cells 1..N for a spec's column count, so this
    // never gets mistaken for real data (apps/api/src/upload/parse.service.ts's extractRows()).
    expect(String(exampleRow.getCell(5).value)).toContain("CONTOH");
  });

  it("bolds and shades the header row and freezes it (rows 1-2) so it stays visible while scrolling", async () => {
    const buffer = await service.generate("cost");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Data")!;

    expect(sheet.getRow(2).getCell(1).font?.bold).toBe(true);
    expect(sheet.views?.[0]).toMatchObject({ state: "frozen", ySplit: 2 });
  });

  it("throws NotFoundException when TEMPLATE_SPECS has no entry for a given type", async () => {
    // Every `UploadType` enum value now has a spec — this proves the
    // NotFoundException branch itself still works by bypassing the type
    // system the same way a stale/future enum value slipping through
    // `ParseEnumPipe` before a spec is added for it would.
    await expect(service.generate("not_a_real_type" as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});
