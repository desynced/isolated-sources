import type { MetadataFact } from "./types.js";

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8];

const LABELS: Record<number, string> = {
  0x010e: "Image description",
  0x010f: "Camera make",
  0x0110: "Camera model",
  0x0131: "Software",
  0x0132: "Date taken",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x9c9b: "Title",
  0x9c9c: "Comment",
  0x9c9d: "Author",
  0x9c9e: "Keywords",
  0x9c9f: "Subject",
  0x9003: "Original date",
  0x9004: "Digitized date",
  0xa430: "Camera owner",
  0xa431: "Camera serial",
};

interface GpsParts {
  latRef?: string;
  lonRef?: string;
  lat?: number[];
  lon?: number[];
  alt?: number;
  altRef?: number;
  date?: string;
}

function dataOffset(view: DataView, little: boolean, type: number, count: number, field: number): number | null {
  const size = (TYPE_SIZE[type] ?? 0) * count;
  if (size <= 0 || size > 8_000_000) return null;
  if (size <= 4) return field;
  const pointer = view.getUint32(field, little);
  if (pointer + size > view.byteLength) return null;
  return pointer;
}

function readAscii(view: DataView, offset: number, count: number): string {
  const length = Math.min(count, Math.max(0, view.byteLength - offset));
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  let end = bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      end = i;
      break;
    }
  }
  return new TextDecoder("utf-8").decode(bytes.subarray(0, end)).trim();
}

function readUtf16(view: DataView, offset: number, count: number): string {
  const length = Math.min(count, Math.max(0, view.byteLength - offset));
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  let end = bytes.length;
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    if (bytes[i] === 0 && bytes[i + 1] === 0) {
      end = i;
      break;
    }
  }
  return new TextDecoder("utf-16le").decode(bytes.subarray(0, end)).trim();
}

function readRational(view: DataView, little: boolean, offset: number): number | null {
  if (offset + 8 > view.byteLength) return null;
  const den = view.getUint32(offset + 4, little);
  if (den === 0) return null;
  return view.getUint32(offset, little) / den;
}

function formatDms(parts: number[], ref: string | undefined): string {
  const [deg = 0, min = 0, sec = 0] = parts;
  const decimal = deg + min / 60 + sec / 3600;
  const signed = ref === "S" || ref === "W" ? -decimal : decimal;
  const hemisphere = ref ? ` ${ref}` : "";
  return `${signed.toFixed(5)} (${deg}° ${min}' ${sec.toFixed(2)}"${hemisphere})`;
}

function pushGps(facts: MetadataFact[], gps: GpsParts): void {
  if (gps.lat && gps.lon) {
    facts.push({
      label: "GPS",
      value: `${formatDms(gps.lat, gps.latRef)}, ${formatDms(gps.lon, gps.lonRef)}`,
    });
  } else if (gps.lat) {
    facts.push({ label: "GPS latitude", value: formatDms(gps.lat, gps.latRef) });
  } else if (gps.lon) {
    facts.push({ label: "GPS longitude", value: formatDms(gps.lon, gps.lonRef) });
  }
  if (gps.alt !== undefined) {
    const sign = gps.altRef === 1 ? -gps.alt : gps.alt;
    facts.push({ label: "GPS altitude", value: `${sign.toFixed(1)} m` });
  }
  if (gps.date) facts.push({ label: "GPS date", value: gps.date });
}

function walk(
  view: DataView,
  little: boolean,
  offset: number,
  facts: MetadataFact[],
  gps: GpsParts | null,
  seen: Set<number>,
  depth: number,
): void {
  if (depth > 6 || seen.has(offset) || offset < 0 || offset + 2 > view.byteLength) return;
  seen.add(offset);
  const count = view.getUint16(offset, little);
  if (count > 2000 || offset + 2 + count * 12 > view.byteLength) return;
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const n = view.getUint32(entry + 4, little);
    const field = entry + 8;
    if (tag === 0x8769 || tag === 0x8825) {
      const pointer = view.getUint32(field, little);
      if (tag === 0x8825) {
        const nested: GpsParts = {};
        walk(view, little, pointer, facts, nested, seen, depth + 1);
        pushGps(facts, nested);
      } else {
        walk(view, little, pointer, facts, gps, seen, depth + 1);
      }
      continue;
    }
    if (tag === 0x927c) {
      facts.push({ label: "Camera maker note", value: "Present" });
      continue;
    }
    const at = dataOffset(view, little, type, n, field);
    if (at === null) continue;
    if (gps && tag === 0x0002 && type === 5 && n >= 3) {
      gps.lat = [0, 1, 2].map((index) => readRational(view, little, at + index * 8) ?? 0);
      continue;
    }
    if (gps && tag === 0x0004 && type === 5 && n >= 3) {
      gps.lon = [0, 1, 2].map((index) => readRational(view, little, at + index * 8) ?? 0);
      continue;
    }
    if (gps && tag === 0x0006 && type === 5) {
      const alt = readRational(view, little, at);
      if (alt !== null) gps.alt = alt;
      continue;
    }
    if (gps && tag === 0x0005 && (type === 1 || type === 3) && n >= 1) {
      gps.altRef = type === 1 ? view.getUint8(at) : view.getUint16(at, little);
      continue;
    }
    const xp = tag >= 0x9c9b && tag <= 0x9c9f;
    let text = "";
    if (xp) text = readUtf16(view, at, n);
    else if (type === 2) text = readAscii(view, at, n);
    if (!text) continue;
    if (gps && tag === 0x0001) gps.latRef = text;
    else if (gps && tag === 0x0003) gps.lonRef = text;
    else if (gps && tag === 0x001d) gps.date = text;
    const label = LABELS[tag];
    if (label && !gps) facts.push({ label, value: text });
  }
  const nextAt = offset + 2 + count * 12;
  if (nextAt + 4 <= view.byteLength) {
    const next = view.getUint32(nextAt, little);
    if (next) walk(view, little, next, facts, gps, seen, depth + 1);
  }
}

/** Read identifying EXIF and GPS from a TIFF block. Returns [] when it is not TIFF. */
export function readExif(bytes: Uint8Array): MetadataFact[] {
  if (bytes.length < 8) return [];
  const little = bytes[0] === 0x49 && bytes[1] === 0x49 ? true : bytes[0] === 0x4d && bytes[1] === 0x4d ? false : null;
  if (little === null) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, little) !== 42) return [];
  const facts: MetadataFact[] = [];
  walk(view, little, view.getUint32(4, little), facts, null, new Set(), 0);
  return facts;
}
