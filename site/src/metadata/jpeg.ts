import { u16be } from "./binary.js";
import { readExif } from "./exif.js";
import type { MetadataFact, StripResult } from "./types.js";
import { cleanedName } from "./types.js";

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";

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

function iptcFacts(data: Uint8Array): MetadataFact[] {
  const facts: MetadataFact[] = [];
  const labels: Record<number, string> = {
    25: "IPTC keywords",
    80: "IPTC byline",
    90: "IPTC city",
    92: "IPTC location",
    101: "IPTC country",
    116: "IPTC copyright",
    120: "IPTC caption",
  };
  for (let i = 0; i + 5 < data.length; i++) {
    if (data[i] !== 0x1c || data[i + 1] !== 0x02) continue;
    const dataset = data[i + 2];
    const length = (data[i + 3] << 8) | data[i + 4];
    if (i + 5 + length > data.length) break;
    const label = labels[dataset];
    if (label) {
      const value = new TextDecoder("latin1").decode(data.subarray(i + 5, i + 5 + length)).trim();
      if (value) facts.push({ label, value });
    }
    i += 4 + length;
  }
  if (facts.length === 0) facts.push({ label: "IPTC", value: "Present" });
  return facts;
}

function app1Facts(data: Uint8Array): MetadataFact[] {
  if (data.length >= 6 && data[0] === 0x45 && data[1] === 0x78 && data[2] === 0x69 && data[3] === 0x66 && data[4] === 0) {
    const facts = readExif(data.subarray(6));
    return facts.length > 0 ? facts : [{ label: "EXIF", value: "Present" }];
  }
  if (data.length >= XMP_HEADER.length) {
    let match = true;
    for (let i = 0; i < XMP_HEADER.length; i++) {
      if (data[i] !== XMP_HEADER.charCodeAt(i)) {
        match = false;
        break;
      }
    }
    if (match) return xmpFacts(new TextDecoder().decode(data.subarray(XMP_HEADER.length)));
  }
  return [{ label: "APP1 metadata", value: "Present" }];
}

function isIcc(data: Uint8Array): boolean {
  const mark = "ICC_PROFILE";
  if (data.length < mark.length) return false;
  for (let i = 0; i < mark.length; i++) if (data[i] !== mark.charCodeAt(i)) return false;
  return true;
}

/** Strip EXIF, GPS, XMP, IPTC, and comments. The compressed image scan is copied through. */
export function stripJpeg(bytes: Uint8Array, name: string): StripResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("This JPEG could not be read. The file was not changed.");
  }
  const found: MetadataFact[] = [];
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("This JPEG could not be read. The file was not changed.");
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) break;
    const marker = bytes[i];
    i += 1;
    if (marker === 0xd9) {
      kept.push(new Uint8Array([0xff, 0xd9]));
      break;
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (i + 1 >= bytes.length) throw new Error("This JPEG could not be read. The file was not changed.");
    const size = u16be(bytes, i);
    if (size < 2 || i + size > bytes.length) throw new Error("This JPEG could not be read. The file was not changed.");
    const data = bytes.subarray(i + 2, i + size);
    const segment = bytes.subarray(i - 2, i + size);
    if (marker === 0xda) {
      kept.push(bytes.subarray(i - 2));
      break;
    }
    const stripApp1 = marker === 0xe1;
    const stripIptc = marker === 0xed;
    const stripComment = marker === 0xfe;
    const stripApp2 = marker === 0xe2 && !isIcc(data);
    const stripApp12 = marker === 0xec;
    if (stripApp1) found.push(...app1Facts(data));
    else if (stripIptc) found.push(...iptcFacts(data));
    else if (stripComment) {
      const text = new TextDecoder("latin1").decode(data).replace(/\0/g, "").trim();
      found.push({ label: "Comment", value: text || "Present" });
    } else if (stripApp2 || stripApp12) {
      found.push({ label: "Photo metadata", value: "Present" });
    } else {
      kept.push(segment);
    }
    i += size;
  }
  let length = 0;
  for (const part of kept) length += part.length;
  const cleaned = new Uint8Array(length);
  let offset = 0;
  for (const part of kept) {
    cleaned.set(part, offset);
    offset += part.length;
  }
  return {
    found,
    notes: [
      "The picture itself is not changed. A color profile is kept when the file has one.",
      "EXIF, GPS, XMP, IPTC, and comments are removed.",
    ],
    cleaned,
    downloadName: cleanedName(name),
    mediaType: "image/jpeg",
  };
}
