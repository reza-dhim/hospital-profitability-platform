import { Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { UploadType } from "@prisma/client";
import { TEMPLATE_SPECS, TEMPLATE_VERSION } from "./template-specs";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
const EXAMPLE_NOTE = "← CONTOH: hapus baris ini sebelum unggah data asli";

function columnWidth(header: string, example: string): number {
  return Math.min(40, Math.max(14, header.length + 2, example.length + 2));
}

/** docs/06_UPLOAD_ENGINE.md §1 (templates) / §6 (guided upload UX — "template download prompt"). */
@Injectable()
export class TemplateService {
  async generate(type: UploadType): Promise<Buffer> {
    const spec = TEMPLATE_SPECS[type];
    if (!spec) {
      throw new NotFoundException({
        code: "UPLOAD_TEMPLATE_NOT_FOUND",
        message: `No template exists for upload type '${type}'.`,
      });
    }

    const workbook = new ExcelJS.Workbook();
    this.addInstructionsSheet(workbook, spec);
    this.addDataSheet(workbook, spec);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /** "Instruksi" sheet — type-level notes, then one row per column explaining what it expects. Read before "Data" (docs/06 §6's guided-upload principle applied to the template file itself, not just the UI around it). */
  private addInstructionsSheet(workbook: ExcelJS.Workbook, spec: (typeof TEMPLATE_SPECS)[UploadType]): void {
    const sheet = workbook.addWorksheet("Instruksi");
    sheet.columns = [{ width: 60 }];

    spec!.notes.forEach((note) => {
      const row = sheet.addRow([`• ${note}`]);
      row.getCell(1).alignment = { wrapText: true };
    });
    sheet.addRow([]);

    const tableHeader = sheet.addRow(["Kolom", "Keterangan", "Contoh"]);
    tableHeader.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
    });
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 60;
    sheet.getColumn(3).width = 20;

    spec!.columns.forEach((column) => {
      const row = sheet.addRow([column.header, column.description, column.example]);
      row.getCell(2).alignment = { wrapText: true };
    });
  }

  /** "Data" sheet — hidden version marker (row 1, unchanged from prior versions), bold+frozen header (row 2), one styled example row (row 3) a real upload's first data row will overwrite or the user deletes outright. */
  private addDataSheet(workbook: ExcelJS.Workbook, spec: (typeof TEMPLATE_SPECS)[UploadType]): void {
    const sheet = workbook.addWorksheet("Data");

    // Hidden version marker row (docs/06_UPLOAD_ENGINE.md §1: "template_version
    // embedded as a hidden header row"). Deliberately not using
    // `worksheet.columns = [...]` for the visible headers below — exceljs's
    // column-header shorthand writes its own header into row 1, which would
    // collide with this marker.
    const versionRow = sheet.getRow(1);
    versionRow.getCell(1).value = `TEMPLATE_VERSION:${TEMPLATE_VERSION}`;
    versionRow.hidden = true;
    versionRow.commit();

    const headerRow = sheet.getRow(2);
    spec!.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      sheet.getColumn(index + 1).width = columnWidth(column.header, column.example);
    });
    headerRow.commit();

    const exampleRow = sheet.getRow(3);
    spec!.columns.forEach((column, index) => {
      exampleRow.getCell(index + 1).value = column.example;
    });
    exampleRow.getCell(spec!.columns.length + 1).value = EXAMPLE_NOTE;
    exampleRow.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { italic: true, color: { argb: "FF808080" } };
    });
    exampleRow.getCell(spec!.columns.length + 1).font = { italic: true, color: { argb: "FFC2410C" } };
    exampleRow.commit();

    sheet.views = [{ state: "frozen", ySplit: 2 }];
  }
}
