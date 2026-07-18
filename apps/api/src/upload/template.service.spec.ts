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

  it("throws NotFoundException for an upload type with no template yet (phased rollout)", async () => {
    await expect(service.generate("driver")).rejects.toBeInstanceOf(NotFoundException);
  });
});
