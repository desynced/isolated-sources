import { PDFDocument, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { checkHidden } from "../src/hidden/check.js";
import { zip } from "../src/metadata/zip.js";

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function coveredPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  page.drawText("Hidden name", { x: 50, y: 100, size: 12, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: 40, y: 90, width: 160, height: 30, color: rgb(0, 0, 0) });
  page.drawText("Ghost text", { x: 50, y: 200, size: 12, color: rgb(1, 1, 1) });
  page.drawText("Visible body stays", { x: 50, y: 40, size: 12, color: rgb(0, 0, 0) });
  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

async function wordFile(): Promise<Uint8Array> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>White name</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>Vanished name</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:color w:val="111111"/></w:rPr><w:t>Visible body stays</w:t></w:r></w:p>
</w:body></w:document>`;
  return zip([{ name: "word/document.xml", data: text(xml) }]);
}

async function workbook(): Promise<Uint8Array> {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Visible" sheetId="1" r:id="rId1"/>
    <sheet name="Secret" sheetId="2" state="hidden" r:id="rId2"/>
  </sheets>
</workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
</Relationships>`;
  const sheet1 = `<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`;
  const sheet2 = `<worksheet>
    <cols><col min="3" max="3" hidden="1"/></cols>
    <sheetData>
      <row r="1"><c r="A1"><v>1</v></c></row>
      <row r="4" hidden="1"><c r="A4"><v>9</v></c></row>
    </sheetData>
  </worksheet>`;
  return zip([
    { name: "xl/workbook.xml", data: text(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: text(rels) },
    { name: "xl/worksheets/sheet1.xml", data: text(sheet1) },
    { name: "xl/worksheets/sheet2.xml", data: text(sheet2) },
  ]);
}

describe("hidden content checks", () => {
  it("reports PDF text under a dark shape and light text", async () => {
    const report = await checkHidden(await coveredPdf());
    const details = report.warnings.map((warning) => warning.detail).join("\n");
    expect(details).toMatch(/under a dark filled shape/i);
    expect(details).toContain("Hidden name");
    expect(details).toMatch(/light or invisible text/i);
    expect(details).toContain("Ghost text");
    expect(details).not.toMatch(/Visible body stays/);
    expect(report.notes.join(" ")).toMatch(/best-effort/i);
    expect(report.notes.join(" ")).toMatch(/does not change the file/i);
    expect(report.notes.join(" ")).toMatch(/you must review/i);
  });

  it("reports white and vanished Word text", async () => {
    const report = await checkHidden(await wordFile());
    const details = report.warnings.map((warning) => warning.detail).join("\n");
    expect(details).toContain("White name");
    expect(details).toContain("Vanished name");
    expect(details).not.toContain("Visible body stays");
  });

  it("reports hidden Excel sheets, rows, and columns without cell values", async () => {
    const report = await checkHidden(await workbook());
    const details = report.warnings.map((warning) => warning.detail).join("\n");
    expect(details).toMatch(/Sheet “Secret” is hidden/);
    expect(details).toMatch(/hidden row/);
    expect(details).toContain("4");
    expect(details).toMatch(/column 3/i);
    expect(details).not.toContain(">9<");
    expect(report.notes.join(" ")).toMatch(/you must review/i);
  });

  it("refuses a file it does not understand", async () => {
    await expect(checkHidden(text("hello"))).rejects.toThrow(/PDF/);
  });
});
