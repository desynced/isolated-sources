import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { asciiIncludes, concat } from "../src/metadata/binary.js";
import { crc32 } from "../src/metadata/crc.js";
import { readExif } from "../src/metadata/exif.js";
import { stripFile } from "../src/metadata/strip.js";
import { unzip, zip } from "../src/metadata/zip.js";

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function be16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 255, value & 255]);
}

function be32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function tiffWithArtistAndGps(): Uint8Array {
  const artist = text("Zelda Quinn\0");
  const bytes = new Uint8Array(152);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, 0x013b, true);
  view.setUint16(12, 2, true);
  view.setUint32(14, artist.length, true);
  view.setUint32(18, 38, true);
  view.setUint16(22, 0x8825, true);
  view.setUint16(24, 4, true);
  view.setUint32(26, 1, true);
  view.setUint32(30, 50, true);
  bytes.set(artist, 38);
  view.setUint16(50, 4, true);
  const entry = (offset: number, tag: number, type: number, count: number, value: number): void => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, value, true);
  };
  entry(52, 0x0001, 2, 2, 0x4e);
  entry(64, 0x0002, 5, 3, 104);
  entry(76, 0x0003, 2, 2, 0x57);
  entry(88, 0x0004, 5, 3, 128);
  const rational = (offset: number, num: number, den: number): void => {
    view.setUint32(offset, num, true);
    view.setUint32(offset + 4, den, true);
  };
  rational(104, 37, 1);
  rational(112, 30, 1);
  rational(120, 0, 1);
  rational(128, 122, 1);
  rational(136, 15, 1);
  rational(144, 0, 1);
  return bytes;
}

function jpegSegment(marker: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (data.length + 2) >> 8;
  out[3] = (data.length + 2) & 255;
  out.set(data, 4);
  return out;
}

function sampleJpeg(): Uint8Array {
  const exif = concat([text("Exif\0\0"), tiffWithArtistAndGps()]);
  const scan = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x11, 0x22, 0xff, 0xd9]);
  return concat([
    new Uint8Array([0xff, 0xd8]),
    jpegSegment(0xe1, exif),
    jpegSegment(0xfe, text("Secret caption")),
    scan,
  ]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(text(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function samplePng(): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = new Uint8Array([9, 8, 7, 6, 5]);
  return concat([
    signature,
    pngChunk("IHDR", new Uint8Array(13)),
    pngChunk("tEXt", text("Author\0Zelda Quinn")),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(text(type), 4);
  out.set(payload, 8);
  return out;
}

function full(version: number, payload: Uint8Array): Uint8Array {
  const head = new Uint8Array(4);
  head[0] = version;
  return concat([head, payload]);
}

function sampleHeic(tiff: Uint8Array): Uint8Array {
  const payload = concat([new Uint8Array(4), tiff]);
  const infe = box("infe", full(2, concat([be16(1), be16(0), text("Exif"), new Uint8Array([0])])));
  const iinf = box("iinf", full(0, concat([be16(1), infe])));
  const iloc = box(
    "iloc",
    full(1, concat([new Uint8Array([0x44, 0x00]), be16(1), be16(1), be16(0), be16(0), be16(1), be32(0), be32(payload.length)])),
  );
  const ftyp = box("ftyp", concat([text("heic"), be32(0), text("mif1")]));
  const meta = box("meta", full(0, concat([iinf, iloc])));
  const file = concat([ftyp, meta, box("mdat", payload)]);
  new DataView(file.buffer).setUint32(ftyp.length + meta.length - 8, ftyp.length + meta.length + 8);
  return file;
}

async function sampleDocx(): Promise<Uint8Array> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p w:rsidR="00AA11BB">
      <w:ins w:id="1" w:author="Nia Cole" w:date="2024-01-02T00:00:00Z"><w:r><w:t>Visible body stays</w:t></w:r></w:ins>
    </w:p>
    <w:del w:id="2" w:author="Rowan Patel" w:date="2024-01-03T00:00:00Z"><w:r><w:delText>Old secret</w:delText></w:r></w:del>
  </w:body>
</w:document>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Zelda Quinn</dc:creator>
  <cp:lastModifiedBy>Rowan Patel</cp:lastModifiedBy>
  <cp:revision>7</cp:revision>
</cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties>
  <Company>Quinn LLP</Company>
  <Manager>Ada Boss</Manager>
</Properties>`;
  const comments = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Ada Comment" w:date="2024-01-04T00:00:00Z" w:initials="AC">
    <w:p><w:r><w:t>Keep this comment</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;
  const custom = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties>
  <property name="Matter"><vt:lpwstr>ACME-99</vt:lpwstr></property>
</Properties>`;
  return zip([
    { name: "[Content_Types].xml", data: text("<Types></Types>") },
    { name: "docProps/core.xml", data: text(core) },
    { name: "docProps/app.xml", data: text(app) },
    { name: "docProps/custom.xml", data: text(custom) },
    { name: "word/document.xml", data: text(documentXml) },
    { name: "word/comments.xml", data: text(comments) },
  ]);
}

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle("Quiet title");
  doc.setAuthor("Zelda Quinn");
  doc.setSubject("Subject line");
  doc.setCreator("Local Editor");
  doc.setProducer("Local Producer");
  doc.addPage().drawText("Visible body stays");
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator><rdf:Seq><rdf:li>Xmp Person</rdf:li></rdf:Seq></dc:creator></rdf:Description>
</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const stream = doc.context.stream(text(xmp), { Type: "Metadata", Subtype: "XML" });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(stream));
  return new Uint8Array(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
}

function fact(result: { found: { label: string; value: string }[] }, label: string): string {
  const values = result.found.filter((item) => item.label === label).map((item) => item.value);
  return values.join(" | ");
}

describe("metadata stripping", () => {
  it("reads EXIF artist and GPS", () => {
    const facts = readExif(tiffWithArtistAndGps());
    expect(fact({ found: facts }, "Artist")).toBe("Zelda Quinn");
    expect(fact({ found: facts }, "GPS")).toContain("37.50000");
    expect(fact({ found: facts }, "GPS")).toContain("-122.25000");
  });

  it("round-trips a zip archive", async () => {
    const packed = await zip([
      { name: "hello.txt", data: text("hello metadata") },
      { name: "empty.txt", data: new Uint8Array() },
    ]);
    const entries = await unzip(packed);
    expect(entries.map((entry) => entry.name)).toEqual(["hello.txt", "empty.txt"]);
    expect(new TextDecoder().decode(entries[0].data)).toBe("hello metadata");
  });

  it("clears Word authors and keeps visible text", async () => {
    const result = await stripFile("note.docx", await sampleDocx());
    expect(fact(result, "Author")).toBe("Zelda Quinn");
    expect(fact(result, "Last modified by")).toBe("Rowan Patel");
    expect(fact(result, "Revision")).toBe("7");
    expect(fact(result, "Company")).toBe("Quinn LLP");
    expect(fact(result, "Comment author")).toBe("Ada Comment");
    expect(fact(result, "Tracked-change author")).toContain("Nia Cole");
    expect(fact(result, "Tracked-change author")).toContain("Rowan Patel");
    expect(fact(result, "Custom property (Matter)")).toBe("ACME-99");
    expect(fact(result, "Revision identifiers")).toMatch(/1 value/);
    expect(result.notes.join(" ")).toMatch(/you must review/i);
    expect(result.downloadName).toBe("cleaned-note.docx");
    const entries = await unzip(result.cleaned);
    const xml = entries.map((entry) => new TextDecoder().decode(entry.data)).join("\n");
    expect(xml).toContain("Visible body stays");
    expect(xml).toContain("Old secret");
    expect(xml).toContain("Keep this comment");
    expect(xml).not.toContain("Zelda Quinn");
    expect(xml).not.toContain("Nia Cole");
    expect(xml).not.toContain("Ada Comment");
    expect(xml).not.toContain("Quinn LLP");
    expect(xml).not.toContain("ACME-99");
    expect(xml).not.toContain("w:rsidR");
  });

  it("clears PDF info and XMP and keeps page text", async () => {
    const result = await stripFile("brief.pdf", await samplePdf());
    expect(fact(result, "Author")).toBe("Zelda Quinn");
    expect(fact(result, "Title")).toBe("Quiet title");
    expect(fact(result, "XMP creator")).toContain("Xmp Person");
    expect(result.notes.join(" ")).toMatch(/complex structure may keep some data/i);
    expect(result.notes.join(" ")).toMatch(/you must review/i);
    expect(asciiIncludes(result.cleaned, "Zelda Quinn")).toBe(false);
    expect(asciiIncludes(result.cleaned, "Xmp Person")).toBe(false);
    expect(asciiIncludes(result.cleaned, "github.com")).toBe(false);
    const again = await PDFDocument.load(result.cleaned);
    expect(again.getPageCount()).toBe(1);
    expect(again.getAuthor()).toBeUndefined();
    const contents = again.getPage(0).node.lookup(PDFName.of("Contents"));
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    const decoded = streams
      .map((item) => {
        const stream = item instanceof PDFRawStream ? item : again.context.lookup(item);
        if (!(stream instanceof PDFRawStream)) throw new Error(`page contents are ${stream?.constructor?.name ?? "missing"}`);
        return new TextDecoder().decode(decodePDFRawStream(stream).decode());
      })
      .join("\n");
    const hex = [...text("Visible body stays")].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(decoded.toLowerCase()).toContain(hex);
  });

  it("strips JPEG EXIF, GPS, and comments without dropping the scan", async () => {
    const original = sampleJpeg();
    const result = await stripFile("photo.jpg", original);
    expect(fact(result, "Artist")).toBe("Zelda Quinn");
    expect(fact(result, "GPS")).toContain("37.50000");
    expect(fact(result, "Comment")).toBe("Secret caption");
    expect(asciiIncludes(result.cleaned, "Zelda Quinn")).toBe(false);
    expect(asciiIncludes(result.cleaned, "Secret caption")).toBe(false);
    expect(result.cleaned[0]).toBe(0xff);
    expect(result.cleaned[1]).toBe(0xd8);
    expect(result.cleaned.at(-2)).toBe(0xff);
    expect(result.cleaned.at(-1)).toBe(0xd9);
    expect(result.cleaned).toContain(0xda);
    expect(result.notes.join(" ")).toMatch(/picture itself is not changed/i);
  });

  it("strips PNG text and keeps the image chunk", async () => {
    const result = await stripFile("photo.png", samplePng());
    expect(fact(result, "Author")).toBe("Zelda Quinn");
    expect(asciiIncludes(result.cleaned, "Zelda Quinn")).toBe(false);
    expect(asciiIncludes(result.cleaned, "IDAT")).toBe(true);
    const idat = [9, 8, 7, 6, 5];
    const joined = Array.from(result.cleaned).join(",");
    expect(joined).toContain(idat.join(","));
  });

  it("clears HEIC EXIF in place", async () => {
    const result = await stripFile("photo.heic", sampleHeic(tiffWithArtistAndGps()));
    expect(fact(result, "Artist")).toBe("Zelda Quinn");
    expect(fact(result, "GPS")).toContain("-122.25000");
    expect(asciiIncludes(result.cleaned, "Zelda Quinn")).toBe(false);
    expect(asciiIncludes(result.cleaned, "heic")).toBe(true);
    expect(result.notes.join(" ")).toMatch(/unusual layout/i);
    expect(result.notes.join(" ")).toMatch(/you must review/i);
  });

  it("refuses a file it does not understand", async () => {
    await expect(stripFile("notes.txt", text("hello"))).rejects.toThrow(/Word file/);
  });
});
