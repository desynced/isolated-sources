import { stripDocx } from "./docx.js";
import { stripHeic } from "./heic.js";
import { stripJpeg } from "./jpeg.js";
import { stripPdf } from "./pdf.js";
import { stripPng } from "./png.js";
import { unzip } from "./zip.js";
import type { StripResult } from "./types.js";
import { REVIEW_NOTE } from "./types.js";

const MAX_BYTES = 40 * 1024 * 1024;

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

async function isDocx(bytes: Uint8Array): Promise<boolean> {
  if (!isZip(bytes)) return false;
  try {
    const entries = await unzip(bytes);
    return entries.some((entry) => entry.name === "word/document.xml");
  } catch {
    return false;
  }
}

function withReview(result: StripResult): StripResult {
  if (!result.notes.includes(REVIEW_NOTE)) result.notes.push(REVIEW_NOTE);
  return result;
}

/** Clean one file in memory. The bytes are not sent anywhere. */
export async function stripFile(fileName: string, bytes: Uint8Array): Promise<StripResult> {
  if (bytes.length === 0) throw new Error("That file is empty. Nothing was changed.");
  if (bytes.length > MAX_BYTES) throw new Error("This file is larger than 40 MB, so it was not changed.");
  const lower = fileName.toLowerCase();
  if (isPdf(bytes)) return withReview(await stripPdf(bytes, fileName));
  if (isPng(bytes)) return withReview(await stripPng(bytes, fileName));
  if (isJpeg(bytes)) return withReview(stripJpeg(bytes, fileName));
  if (await isDocx(bytes)) return withReview(await stripDocx(bytes, fileName));
  try {
    return withReview(stripHeic(bytes, fileName));
  } catch (error) {
    if (lower.endsWith(".heic") || lower.endsWith(".heif")) {
      throw error instanceof Error ? error : new Error("This HEIC photo could not be read. The file was not changed.");
    }
  }
  if (lower.endsWith(".pdf")) {
    throw new Error("This PDF could not be read. It may be encrypted or damaged. The file was not changed.");
  }
  throw new Error("Choose a Word file (.docx), a PDF, or a JPEG, PNG, or HEIC photo. The file was not changed.");
}
