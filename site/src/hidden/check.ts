import { docxHiddenWarnings, xlsxHiddenWarnings } from "./office.js";
import { pdfHiddenWarnings } from "./pdf.js";
import { HIDDEN_NOTE, type HiddenReport, type HiddenWarning } from "./types.js";

const MAX_BYTES = 40 * 1024 * 1024;

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function zipNames(bytes: Uint8Array): Promise<string[]> {
  const { unzip } = await import("../metadata/zip.js");
  const entries = await unzip(bytes);
  return entries.map((entry) => entry.name);
}

/** Report-only. The file is not modified and is not sent anywhere. */
export async function checkHidden(bytes: Uint8Array): Promise<HiddenReport> {
  if (bytes.length === 0) throw new Error("That file is empty. Nothing was checked.");
  if (bytes.length > MAX_BYTES) throw new Error("This file is larger than 40 MB, so it was not checked.");
  let warnings: HiddenWarning[] = [];
  if (isPdf(bytes)) {
    try {
      warnings = await pdfHiddenWarnings(bytes);
    } catch {
      throw new Error("This PDF could not be read. It may be encrypted or damaged. The file was not changed.");
    }
  } else if (isZip(bytes)) {
    let names: string[] = [];
    try {
      names = await zipNames(bytes);
    } catch {
      throw new Error("This file could not be read. It was not changed.");
    }
    if (names.includes("word/document.xml")) warnings = await docxHiddenWarnings(bytes);
    else if (names.includes("xl/workbook.xml")) warnings = await xlsxHiddenWarnings(bytes);
    else throw new Error("Choose a PDF, a Word file (.docx), or an Excel file (.xlsx). The file was not changed.");
  } else {
    throw new Error("Choose a PDF, a Word file (.docx), or an Excel file (.xlsx). The file was not changed.");
  }
  return {
    warnings: warnings.slice(0, 30),
    notes: [
      warnings.length > 30 ? `Showing 30 of ${warnings.length} warnings.` : "",
      HIDDEN_NOTE,
    ].filter((note) => note.length > 0),
  };
}
