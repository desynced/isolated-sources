import { unzip, zip, type ZipEntry } from "./zip.js";
import { stripJpeg } from "./jpeg.js";
import type { MetadataFact, StripResult } from "./types.js";
import { cleanedName } from "./types.js";

const CORE_TAGS: Record<string, string> = {
  title: "Title",
  subject: "Subject",
  creator: "Author",
  keywords: "Keywords",
  description: "Description",
  lastModifiedBy: "Last modified by",
  revision: "Revision",
  category: "Category",
  lastPrinted: "Last printed",
  created: "Created",
  modified: "Modified",
};

const APP_TAGS: Record<string, string> = {
  Company: "Company",
  Manager: "Manager",
  HyperlinkBase: "Hyperlink base",
};

function textOf(xml: string, local: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}>`, "g");
  const values: string[] = [];
  for (const match of xml.matchAll(re)) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) values.push(text);
  }
  return values;
}

function blankTags(xml: string, locals: readonly string[]): string {
  let next = xml;
  for (const local of locals) {
    const re = new RegExp(`(<(?:[\\w.-]+:)?${local}\\b[^>]*>)[\\s\\S]*?(</(?:[\\w.-]+:)?${local}>)`, "g");
    next = next.replace(re, "$1$2");
  }
  return next;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function attrValues(xml: string, attr: string): string[] {
  const re = new RegExp(`\\b(?:[\\w.-]+:)?${attr}="([^"]*)"`, "gi");
  return unique([...xml.matchAll(re)].map((match) => match[1]));
}

function blankAttrs(xml: string, attrs: readonly string[]): string {
  let next = xml;
  for (const attr of attrs) {
    const re = new RegExp(`(\\b(?:[\\w.-]+:)?${attr}=")[^"]*(")`, "gi");
    next = next.replace(re, "$1$2");
  }
  return next;
}

function rsidValues(xml: string): string[] {
  const attrs = [...xml.matchAll(/\bw:rsid[A-Za-z0-9]*="([^"]+)"/g)].map((match) => match[1]);
  const elems = [...xml.matchAll(/\bw:rsid\b[^>]*\bw:val="([^"]+)"/g)].map((match) => match[1]);
  return unique([...attrs, ...elems]);
}

function stripRsids(xml: string): string {
  return xml
    .replace(/\s+w:rsid[A-Za-z0-9]*="[^"]*"/g, "")
    .replace(/<w:rsids\b[^>]*>[\s\S]*?<\/w:rsids>/g, "");
}

function customFacts(xml: string): MetadataFact[] {
  const facts: MetadataFact[] = [];
  const re = /<property\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/property>/g;
  for (const match of xml.matchAll(re)) {
    const value = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (value) facts.push({ label: `Custom property (${match[1] || "unnamed"})`, value });
  }
  return facts;
}

function blankCustom(xml: string): string {
  return xml.replace(/(<vt:[\w.-]+\b[^>]*>)[\s\S]*?(<\/vt:[\w.-]+>)/g, "$1$2");
}

function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Clear author, revision, and property metadata.
 * Body text, comment text, and tracked insertions or deletions stay.
 * Author names on those changes are cleared.
 */
export async function stripDocx(bytes: Uint8Array, name: string): Promise<StripResult> {
  const entries = await unzip(bytes);
  if (!entries.some((entry) => entry.name === "word/document.xml")) {
    throw new Error("This file is not a Word document (.docx). The file was not changed.");
  }
  const found: MetadataFact[] = [];
  const rsids = new Set<string>();
  const next: ZipEntry[] = [];
  for (const entry of entries) {
    const path = entry.name;
    if (/^docProps\/thumbnail\.(jpe?g)$/i.test(path)) {
      try {
        const photo = stripJpeg(entry.data, "thumbnail.jpg");
        for (const fact of photo.found) found.push({ label: `Thumbnail ${fact.label}`, value: fact.value });
        next.push({ name: path, data: photo.cleaned });
      } catch {
        found.push({ label: "Thumbnail", value: "Present, left unchanged" });
        next.push(entry);
      }
      continue;
    }
    const isXml = path.endsWith(".xml");
    if (!isXml) {
      next.push(entry);
      continue;
    }
    let xml = decode(entry.data);
    if (path === "docProps/core.xml") {
      for (const [local, label] of Object.entries(CORE_TAGS)) {
        for (const value of textOf(xml, local)) found.push({ label, value });
      }
      xml = blankTags(xml, Object.keys(CORE_TAGS));
    } else if (path === "docProps/app.xml") {
      for (const [local, label] of Object.entries(APP_TAGS)) {
        for (const value of textOf(xml, local)) found.push({ label, value });
      }
      xml = blankTags(xml, Object.keys(APP_TAGS));
    } else if (path === "docProps/custom.xml") {
      found.push(...customFacts(xml));
      xml = blankCustom(xml);
    } else if (path.startsWith("word/") && path.endsWith(".xml")) {
      const authors = attrValues(xml, "author");
      const initials = attrValues(xml, "initials");
      const commentFile = /\/comments/i.test(path);
      const peopleFile = path.endsWith("/people.xml");
      for (const author of authors) {
        const label = commentFile ? "Comment author" : peopleFile ? "Person list" : "Tracked-change author";
        found.push({ label, value: author });
      }
      for (const value of initials) found.push({ label: "Initials", value });
      for (const value of rsidValues(xml)) rsids.add(value);
      xml = blankAttrs(xml, ["author", "initials", "date"]);
      xml = stripRsids(xml);
    }
    next.push({ name: path, data: encode(xml) });
  }
  if (rsids.size > 0) {
    found.push({
      label: "Revision identifiers",
      value: `${rsids.size} value${rsids.size === 1 ? "" : "s"}`,
    });
  }
  return {
    found,
    notes: [
      "Text you can see is kept, including comment text and tracked insertions or deletions.",
      "Author names, the last-modified-by name, revision identifiers, and personal document properties are cleared.",
      "Custom XML parts other than document properties are not removed.",
    ],
    cleaned: await zip(next),
    downloadName: cleanedName(name),
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
