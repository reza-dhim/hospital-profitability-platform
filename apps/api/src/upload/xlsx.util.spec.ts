import ExcelJS from "exceljs";
import { isValidXlsx } from "./xlsx.util";

describe("isValidXlsx", () => {
  it("returns true for a real, well-formed .xlsx buffer", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Data");
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(isValidXlsx(buffer)).resolves.toBe(true);
  });

  it("returns false for arbitrary non-xlsx bytes", async () => {
    await expect(isValidXlsx(Buffer.from("not an excel file at all"))).resolves.toBe(false);
  });

  it("returns false for a plain-text file renamed with an .xlsx-looking payload (not just extension-based)", async () => {
    const csvLikeBuffer = Buffer.from("period,cost_center_code,coa_account_code,nominal\n2026-01,CC-1,COA-1,1000");
    await expect(isValidXlsx(csvLikeBuffer)).resolves.toBe(false);
  });
});
