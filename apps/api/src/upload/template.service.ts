import { Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { UploadType } from "@prisma/client";
import { TEMPLATE_SPECS, TEMPLATE_VERSION } from "./template-specs";

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
    spec.columns.forEach((column, index) => {
      headerRow.getCell(index + 1).value = column.header;
    });
    headerRow.commit();

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
