import ExcelJS from "exceljs";

/**
 * Signature/structural validation "not just extension" (docs/06_UPLOAD_ENGINE.md
 * §4) via exceljs itself rather than a dedicated MIME-sniffing library
 * (`file-type`'s current major version is ESM-only and doesn't interop with
 * this project's CommonJS build — see the sub-task decision log). Attempting
 * a real parse is strictly more precise than a magic-byte check anyway: it
 * confirms the file is a genuinely well-formed, openable `.xlsx`, not just
 * something that starts with a ZIP signature.
 */
export async function isValidXlsx(buffer: Buffer): Promise<boolean> {
  try {
    // exceljs's bundled `Buffer` type resolves to a structurally-different
    // duplicate of this project's `@types/node` `Buffer` in the dependency
    // tree (a known multi-`@types/node`-copy quirk, not a real incompatibility
    // — both are Node's actual `Buffer` at runtime) — narrow cast, not `any`.
    await new ExcelJS.Workbook().xlsx.load(buffer as never);
    return true;
  } catch {
    return false;
  }
}
