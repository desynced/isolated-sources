import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
} from "pdf-lib";
import { asciiIncludes } from "./binary.js";
import type { MetadataFact, StripResult } from "./types.js";
import { cleanedName } from "./types.js";

const LABELS: Record<string, string> = {
  Title: "Title",
  Author: "Author",
  Subject: "Subject",
  Keywords: "Keywords",
  Creator: "Creator",
  Producer: "Producer",
  CreationDate: "Created",
  ModDate: "Modified",
  Trapped: "Trapped",
};

function nameOf(name: PDFName): string {
  const raw = name.asString();
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

function factValue(value: unknown): string | null {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    try {
      const text = value.decodeText().replace(/\0/g, "").trim();
      if (text) return text;
    } catch {
      const raw = value.asString().trim();
      if (raw) return raw;
    }
  }
  return null;
}

function xmpFacts(xml: string): MetadataFact[] {
  const facts: MetadataFact[] = [];
  const pairs: [string, string][] = [
    ["creator", "XMP creator"],
    ["rights", "XMP rights"],
    ["description", "XMP description"],
    ["title", "XMP title"],
    ["CreatorTool", "XMP tool"],
    ["CreateDate", "XMP created"],
    ["ModifyDate", "XMP modified"],
    ["GPSLatitude", "XMP GPS latitude"],
    ["GPSLongitude", "XMP GPS longitude"],
  ];
  for (const [local, label] of pairs) {
    const re = new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}>`, "i");
    const match = re.exec(xml);
    if (!match) continue;
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) facts.push({ label, value: text });
  }
  if (facts.length === 0 && /xmpmeta|xpacket/i.test(xml)) facts.push({ label: "XMP", value: "Present" });
  return facts;
}

function streamXml(meta: PDFRawStream): string {
  try {
    const decoded = decodePDFRawStream(meta).decode();
    return new TextDecoder().decode(decoded);
  } catch {
    return new TextDecoder().decode(meta.getContents());
  }
}

/**
 * Remove the info dictionary and XMP packet pdf-lib can see.
 * Page content stays. Old unreferenced objects are dropped when the file is rewritten.
 * Encrypted files are refused. Complex PDFs can still keep some data.
 */
export async function stripPdf(bytes: Uint8Array, name: string): Promise<StripResult> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    throw new Error("This PDF could not be read. It may be encrypted or damaged. The file was not changed.");
  }
  const found: MetadataFact[] = [];
  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  if (info instanceof PDFDict) {
    for (const key of [...info.keys()]) {
      const label = nameOf(key);
      const value = factValue(info.lookup(key));
      if (value) found.push({ label: LABELS[label] ?? label, value });
      info.delete(key);
    }
  }
  const metaKey = PDFName.of("Metadata");
  const metaRef = doc.catalog.get(metaKey);
  const meta = doc.catalog.lookup(metaKey);
  if (meta instanceof PDFRawStream) {
    found.push(...xmpFacts(streamXml(meta)));
    doc.catalog.delete(metaKey);
    if (metaRef instanceof PDFRef) doc.context.delete(metaRef);
  }
  const saved = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  const cleaned = new Uint8Array(saved);
  const notes = [
    "Text and pictures you can see on the pages are kept. Attachments and scripts are not removed.",
    "The info dictionary and XMP metadata are removed when this reader can see them.",
    "PDFs with a complex structure may keep some data.",
  ];
  if (found.some((fact) => fact.value.length >= 4 && asciiIncludes(cleaned, fact.value))) {
    notes.push("At least one value listed above is still in the file. Review it before you share it.");
  }
  return {
    found,
    notes,
    cleaned,
    downloadName: cleanedName(name),
    mediaType: "application/pdf",
  };
}
