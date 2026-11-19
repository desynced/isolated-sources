import { bytesBlob, u16le, u32le } from "./binary.js";
import { crc32 } from "./crc.js";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const MAX_ENTRY = 32 * 1024 * 1024;
const MAX_TOTAL = 64 * 1024 * 1024;

class Buf {
  private readonly parts: Uint8Array[] = [];
  length = 0;

  u16(value: number): void {
    const bytes = new Uint8Array(2);
    bytes[0] = value & 255;
    bytes[1] = (value >>> 8) & 255;
    this.push(bytes);
  }

  u32(value: number): void {
    const bytes = new Uint8Array(4);
    bytes[0] = value & 255;
    bytes[1] = (value >>> 8) & 255;
    bytes[2] = (value >>> 16) & 255;
    bytes[3] = (value >>> 24) & 255;
    this.push(bytes);
  }

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

function findEocd(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x05 || bytes[i + 3] !== 0x06) continue;
    const commentLen = u16le(bytes, i + 20);
    if (i + 22 + commentLen === bytes.length) return i;
  }
  throw new Error("This archive could not be read.");
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = bytesBlob(data).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = bytesBlob(data).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(bytes: Uint8Array): Promise<ZipEntry[]> {
  if (bytes.length < 22) throw new Error("This archive could not be read.");
  const eocd = findEocd(bytes);
  const total = u16le(bytes, eocd + 10);
  const cdSize = u32le(bytes, eocd + 12);
  const cdOffset = u32le(bytes, eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("This file uses a ZIP64 archive, which this cleaner does not rewrite.");
  }
  const entries: ZipEntry[] = [];
  let pointer = cdOffset;
  let totalBytes = 0;
  for (let n = 0; n < total; n++) {
    if (pointer + 46 > bytes.length || u32le(bytes, pointer) !== 0x02014b50) {
      throw new Error("This archive could not be read.");
    }
    const method = u16le(bytes, pointer + 10);
    const compSize = u32le(bytes, pointer + 20);
    const nameLen = u16le(bytes, pointer + 28);
    const extraLen = u16le(bytes, pointer + 30);
    const commentLen = u16le(bytes, pointer + 32);
    const localOffset = u32le(bytes, pointer + 42);
    if (compSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("This file uses a ZIP64 archive, which this cleaner does not rewrite.");
    }
    const name = new TextDecoder("utf-8").decode(bytes.subarray(pointer + 46, pointer + 46 + nameLen));
    pointer += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) {
      throw new Error("This archive has an unusual path, so it was not changed.");
    }
    if (localOffset + 30 > bytes.length || u32le(bytes, localOffset) !== 0x04034b50) {
      throw new Error("This archive could not be read.");
    }
    const localNameLen = u16le(bytes, localOffset + 26);
    const localExtraLen = u16le(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > bytes.length) throw new Error("This archive could not be read.");
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    let data: Uint8Array;
    if (method === 0) data = new Uint8Array(compressed);
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error("This archive uses a compression this cleaner does not read.");
    if (data.length > MAX_ENTRY) throw new Error("This file is too large to clean in the browser.");
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL) throw new Error("This file is too large to clean in the browser.");
    entries.push({ name, data });
  }
  return entries;
}

export async function zip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const out = new Buf();
  const locals: { name: Uint8Array; data: Uint8Array; crc: number; comp: Uint8Array; method: number; offset: number }[] =
    [];
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    let method = 0;
    let comp = entry.data;
    if (entry.data.length > 0) {
      try {
        const deflated = await deflateRaw(entry.data);
        if (deflated.length < entry.data.length) {
          method = 8;
          comp = deflated;
        }
      } catch {
        method = 0;
        comp = entry.data;
      }
    }
    const offset = out.length;
    out.u32(0x04034b50);
    out.u16(20);
    out.u16(0x800);
    out.u16(method);
    out.u16(0);
    out.u16(0);
    out.u32(crc);
    out.u32(comp.length);
    out.u32(entry.data.length);
    out.u16(name.length);
    out.u16(0);
    out.push(name);
    out.push(comp);
    locals.push({ name, data: entry.data, crc, comp, method, offset });
  }
  const cdOffset = out.length;
  for (const local of locals) {
    out.u32(0x02014b50);
    out.u16(20);
    out.u16(20);
    out.u16(0x800);
    out.u16(local.method);
    out.u16(0);
    out.u16(0);
    out.u32(local.crc);
    out.u32(local.comp.length);
    out.u32(local.data.length);
    out.u16(local.name.length);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u32(0);
    out.u32(local.offset);
    out.push(local.name);
  }
  const cdSize = out.length - cdOffset;
  out.u32(0x06054b50);
  out.u16(0);
  out.u16(0);
  out.u16(locals.length);
  out.u16(locals.length);
  out.u32(cdSize);
  out.u32(cdOffset);
  out.u16(0);
  return out.bytes();
}
