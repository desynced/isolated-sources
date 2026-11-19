import { latin1, u16be, u32be } from "./binary.js";
import { readExif } from "./exif.js";
import { stripJpeg } from "./jpeg.js";
import type { MetadataFact, StripResult } from "./types.js";
import { cleanedName } from "./types.js";

interface Box {
  type: string;
  start: number;
  size: number;
  header: number;
}

interface ItemInfo {
  id: number;
  type: string;
  contentType: string;
}

interface Extent {
  method: number;
  start: number;
  length: number;
}

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "heif", "mif1", "msf1"]);

function boxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let pointer = start;
  while (pointer + 8 <= end) {
    let size = u32be(bytes, pointer);
    const type = latin1(bytes, pointer + 4, 4);
    let header = 8;
    if (size === 1) {
      if (pointer + 16 > end) break;
      const high = u32be(bytes, pointer + 8);
      const low = u32be(bytes, pointer + 12);
      if (high !== 0) break;
      size = low;
      header = 16;
    } else if (size === 0) {
      size = end - pointer;
    }
    if (size < header || pointer + size > end) break;
    out.push({ type, start: pointer, size, header });
    pointer += size;
  }
  return out;
}

function fullBox(bytes: Uint8Array, box: Box): { version: number; content: number } {
  return { version: bytes[box.start + box.header] ?? 0, content: box.start + box.header + 4 };
}

function cstring(bytes: Uint8Array, offset: number, end: number): { text: string; next: number } {
  let cursor = offset;
  while (cursor < end && bytes[cursor] !== 0) cursor += 1;
  return { text: latin1(bytes, offset, cursor - offset), next: Math.min(end, cursor + 1) };
}

function brands(bytes: Uint8Array): Set<string> {
  const top = boxes(bytes, 0, bytes.length);
  const ftyp = top.find((box) => box.type === "ftyp");
  const found = new Set<string>();
  if (!ftyp) return found;
  const end = ftyp.start + ftyp.size;
  if (ftyp.start + ftyp.header + 4 <= end) found.add(latin1(bytes, ftyp.start + ftyp.header, 4));
  let pointer = ftyp.start + ftyp.header + 8;
  while (pointer + 4 <= end) {
    found.add(latin1(bytes, pointer, 4));
    pointer += 4;
  }
  return found;
}

function readWidth(bytes: Uint8Array, offset: number, size: number): { value: number; next: number } | null {
  if (size === 0) return { value: 0, next: offset };
  if (size === 1 && offset < bytes.length) return { value: bytes[offset], next: offset + 1 };
  if (size === 2 && offset + 2 <= bytes.length) return { value: u16be(bytes, offset), next: offset + 2 };
  if (size === 4 && offset + 4 <= bytes.length) return { value: u32be(bytes, offset), next: offset + 4 };
  if (size === 8 && offset + 8 <= bytes.length) {
    if (u32be(bytes, offset) !== 0) return null;
    return { value: u32be(bytes, offset + 4), next: offset + 8 };
  }
  return null;
}

function parseItems(bytes: Uint8Array, iinf: Box): ItemInfo[] {
  const { version, content } = fullBox(bytes, iinf);
  const countSize = version === 0 ? 2 : 4;
  const end = iinf.start + iinf.size;
  const items: ItemInfo[] = [];
  for (const child of boxes(bytes, content + countSize, end)) {
    if (child.type !== "infe") continue;
    const info = fullBox(bytes, child);
    let cursor = info.content;
    const limit = child.start + child.size;
    if (info.version < 2 || cursor + 8 > limit) continue;
    const idRead = readWidth(bytes, cursor, info.version === 2 ? 2 : 4);
    if (!idRead) continue;
    cursor = idRead.next + 2;
    if (cursor + 4 > limit) continue;
    const type = latin1(bytes, cursor, 4);
    cursor += 4;
    const name = cstring(bytes, cursor, limit);
    cursor = name.next;
    let contentType = "";
    if (type === "mime") contentType = cstring(bytes, cursor, limit).text;
    items.push({ id: idRead.value, type, contentType });
  }
  return items;
}

function parseExtents(bytes: Uint8Array, iloc: Box, idat: Box | undefined): Map<number, Extent[]> {
  const { version, content } = fullBox(bytes, iloc);
  const end = iloc.start + iloc.size;
  const map = new Map<number, Extent[]>();
  if (content + 4 > end) return map;
  const offsetSize = bytes[content] >> 4;
  const lengthSize = bytes[content] & 0x0f;
  const baseSize = bytes[content + 1] >> 4;
  const indexSize = version >= 1 ? bytes[content + 1] & 0x0f : 0;
  let cursor = content + 2;
  const count = readWidth(bytes, cursor, version < 2 ? 2 : 4);
  if (!count) return map;
  cursor = count.next;
  for (let i = 0; i < count.value; i++) {
    const id = readWidth(bytes, cursor, version < 2 ? 2 : 4);
    if (!id) return map;
    cursor = id.next;
    let method = 0;
    if (version >= 1) {
      const methodRead = readWidth(bytes, cursor, 2);
      if (!methodRead) return map;
      method = methodRead.value & 0x0f;
      cursor = methodRead.next;
    }
    const dataRef = readWidth(bytes, cursor, 2);
    if (!dataRef) return map;
    cursor = dataRef.next;
    const base = readWidth(bytes, cursor, baseSize);
    if (!base) return map;
    cursor = base.next;
    const extentCount = readWidth(bytes, cursor, 2);
    if (!extentCount) return map;
    cursor = extentCount.next;
    const extents: Extent[] = [];
    for (let e = 0; e < extentCount.value; e++) {
      if (version >= 1 && indexSize > 0) {
        const index = readWidth(bytes, cursor, indexSize);
        if (!index) return map;
        cursor = index.next;
      }
      const off = readWidth(bytes, cursor, offsetSize);
      const len = off ? readWidth(bytes, off.next, lengthSize) : null;
      if (!off || !len) return map;
      cursor = len.next;
      let start = base.value + off.value;
      if (method === 1 && idat) start = idat.start + idat.header + off.value;
      if ((method === 0 || method === 1) && start >= 0 && len.value >= 0 && start + len.value <= bytes.length) {
        extents.push({ method, start, length: len.value });
      }
    }
    map.set(id.value, extents);
  }
  return map;
}

function tiffSlice(payload: Uint8Array): Uint8Array | null {
  if (payload.length < 8) return null;
  const offset = payload.length >= 4 ? u32be(payload, 0) : 0;
  const candidates = [4 + offset, 0, 4];
  for (const start of candidates) {
    if (start < 0 || start + 4 > payload.length) continue;
    if ((payload[start] === 0x49 || payload[start] === 0x4d) && payload[start] === payload[start + 1]) {
      return payload.subarray(start);
    }
  }
  return null;
}

function looksLikeXmp(payload: Uint8Array): boolean {
  const text = new TextDecoder().decode(payload.subarray(0, Math.min(payload.length, 256)));
  return text.includes("<?x") || text.includes("xmpmeta") || text.includes("rdf:RDF");
}

function clearExtent(bytes: Uint8Array, extent: Extent, replacement?: Uint8Array): void {
  bytes.fill(0, extent.start, extent.start + extent.length);
  if (!replacement) return;
  const count = Math.min(replacement.length, extent.length);
  bytes.set(replacement.subarray(0, count), extent.start);
}

function emptyExif(length: number): Uint8Array {
  const out = new Uint8Array(Math.max(length, 0));
  if (out.length < 18) return out;
  out.set([0x00, 0x00, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 0);
  return out;
}

/**
 * Clear EXIF and XMP items inside a HEIC photo without moving the image data.
 * The metadata block is overwritten in place only when it looks like EXIF, XMP, or a JPEG thumbnail.
 */
export function stripHeic(bytes: Uint8Array, name: string): StripResult {
  const names = brands(bytes);
  if (![...names].some((brand) => HEIC_BRANDS.has(brand))) {
    throw new Error("This HEIC photo could not be read. The file was not changed.");
  }
  const top = boxes(bytes, 0, bytes.length);
  const meta = top.find((box) => box.type === "meta");
  if (!meta) {
    return {
      found: [],
      notes: [
        "No metadata box was found in this HEIC file. The photo was not modified.",
        "A HEIC file with an unusual layout may keep some metadata.",
      ],
      cleaned: new Uint8Array(bytes),
      downloadName: cleanedName(name),
      mediaType: "image/heic",
    };
  }
  const { content } = fullBox(bytes, meta);
  const children = boxes(bytes, content, meta.start + meta.size);
  const iinf = children.find((box) => box.type === "iinf");
  const iloc = children.find((box) => box.type === "iloc");
  const idat = children.find((box) => box.type === "idat") ?? top.find((box) => box.type === "idat");
  if (!iinf || !iloc) {
    return {
      found: [],
      notes: [
        "This HEIC file does not list metadata items in a layout this cleaner can read. The photo was not modified.",
        "A HEIC file with an unusual layout may keep some metadata.",
      ],
      cleaned: new Uint8Array(bytes),
      downloadName: cleanedName(name),
      mediaType: "image/heic",
    };
  }
  const items = parseItems(bytes, iinf);
  const extents = parseExtents(bytes, iloc, idat);
  const cleaned = new Uint8Array(bytes);
  const found: MetadataFact[] = [];
  let cleared = 0;
  for (const item of items) {
    const parts = extents.get(item.id) ?? [];
    const mime = item.contentType.toLowerCase();
    const isExif = item.type === "Exif";
    const isXmp = item.type === "mime" && (mime.includes("xml") || mime.includes("rdf"));
    const isThumb = item.type === "mime" && mime.includes("jpeg");
    if (!isExif && !isXmp && !isThumb) continue;
    for (const extent of parts) {
      const payload = cleaned.subarray(extent.start, extent.start + extent.length);
      if (isExif) {
        const tiff = tiffSlice(payload);
        if (!tiff) continue;
        const facts = readExif(tiff);
        found.push(...(facts.length > 0 ? facts : [{ label: "EXIF", value: "Present" }]));
        clearExtent(cleaned, extent, emptyExif(extent.length));
        cleared += 1;
      } else if (isXmp && looksLikeXmp(payload)) {
        const xml = new TextDecoder().decode(payload);
        const creator = /<(?:[\w.-]+:)?creator\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?creator>/i.exec(xml);
        const text = creator?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        found.push({ label: "XMP", value: text || "Present" });
        clearExtent(cleaned, extent);
        cleared += 1;
      } else if (isThumb && payload.length >= 2 && payload[0] === 0xff && payload[1] === 0xd8) {
        try {
          const photo = stripJpeg(payload, "thumbnail.jpg");
          for (const fact of photo.found) found.push({ label: `Thumbnail ${fact.label}`, value: fact.value });
          if (photo.cleaned.length <= extent.length) {
            clearExtent(cleaned, extent, photo.cleaned);
            cleared += 1;
          } else {
            found.push({ label: "Thumbnail", value: "Present, left unchanged" });
          }
        } catch {
          found.push({ label: "Thumbnail", value: "Present, left unchanged" });
        }
      }
    }
  }
  const notes = [
    "The photo bytes stay in place. This does not re-encode the picture.",
    cleared > 0
      ? "EXIF and XMP blocks this check found were cleared."
      : "No EXIF or XMP block this check recognizes was changed.",
    "A HEIC file with an unusual layout may keep some metadata.",
  ];
  return {
    found,
    notes,
    cleaned,
    downloadName: cleanedName(name),
    mediaType: "image/heic",
  };
}
