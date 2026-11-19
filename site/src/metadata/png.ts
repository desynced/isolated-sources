import { bytesBlob, concat, u32be } from "./binary.js";
import { readExif } from "./exif.js";
import type { MetadataFact, StripResult } from "./types.js";
import { cleanedName } from "./types.js";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const TEXT_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = bytesBlob(data).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function keyword(data: Uint8Array): { key: string; rest: number } {
  let end = 0;
  while (end < data.length && data[end] !== 0) end += 1;
  return { key: new TextDecoder("latin1").decode(data.subarray(0, end)), rest: end + 1 };
}

async function chunkFacts(type: string, data: Uint8Array): Promise<MetadataFact[]> {
  if (type === "tEXt") {
    const { key, rest } = keyword(data);
    const value = new TextDecoder("latin1").decode(data.subarray(rest)).trim();
    return [{ label: key || "Text", value: value || "Present" }];
  }
  if (type === "zTXt") {
    const { key, rest } = keyword(data);
    try {
      const text = new TextDecoder("latin1").decode(await inflateRaw(data.subarray(rest + 1))).trim();
      return [{ label: key || "Compressed text", value: text || "Present" }];
    } catch {
      return [{ label: key || "Compressed text", value: "Present" }];
    }
  }
  if (type === "iTXt") {
    const { key, rest } = keyword(data);
    if (rest >= data.length) return [{ label: key || "International text", value: "Present" }];
    const compressed = data[rest] === 1;
    let cursor = rest + 2;
    for (let skip = 0; skip < 2 && cursor <= data.length; skip++) {
      while (cursor < data.length && data[cursor] !== 0) cursor += 1;
      cursor += 1;
    }
    try {
      const raw = compressed ? await inflateRaw(data.subarray(cursor)) : data.subarray(cursor);
      const text = new TextDecoder().decode(raw).trim();
      return [{ label: key || "International text", value: text || "Present" }];
    } catch {
      return [{ label: key || "International text", value: "Present" }];
    }
  }
  if (type === "eXIf") {
    const facts = readExif(data);
    return facts.length > 0 ? facts : [{ label: "EXIF", value: "Present" }];
  }
  if (type === "tIME" && data.length >= 7) {
    const year = u32be(new Uint8Array([0, 0, data[0], data[1]]), 0);
    const stamp = `${year}-${String(data[2]).padStart(2, "0")}-${String(data[3]).padStart(2, "0")} ${String(data[4]).padStart(2, "0")}:${String(data[5]).padStart(2, "0")}:${String(data[6]).padStart(2, "0")}`;
    return [{ label: "Last modified", value: stamp }];
  }
  return [{ label: type, value: "Present" }];
}

/** Remove text, EXIF, and timestamp chunks. Image and color chunks stay. */
export async function stripPng(bytes: Uint8Array, name: string): Promise<StripResult> {
  if (bytes.length < 8 || !SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error("This PNG could not be read. The file was not changed.");
  }
  const found: MetadataFact[] = [];
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    if (offset + 12 + length > bytes.length) throw new Error("This PNG could not be read. The file was not changed.");
    const type = new TextDecoder("latin1").decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const chunk = bytes.subarray(offset, offset + 12 + length);
    if (TEXT_CHUNKS.has(type)) found.push(...(await chunkFacts(type, data)));
    else kept.push(chunk);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return {
    found,
    notes: [
      "The picture itself is not changed. Color information is kept.",
      "Text, EXIF, and timestamp chunks are removed.",
    ],
    cleaned: concat(kept),
    downloadName: cleanedName(name),
    mediaType: "image/png",
  };
}
