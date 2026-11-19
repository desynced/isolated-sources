import { unzip } from "../metadata/zip.js";
import type { HiddenWarning } from "./types.js";

function textOf(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function flagOn(props: string, tag: string): boolean {
  const match = new RegExp(`<w:${tag}\\b([^>]*)\\/?>`, "i").exec(props);
  if (!match) return false;
  const value = /\bw:val="([^"]*)"/i.exec(match[1])?.[1];
  if (!value) return true;
  return !/^(0|false|off)$/i.test(value);
}

function nearWhite(hex: string): boolean {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return false;
  const channels = [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16));
  return channels.every((channel) => channel >= 0xe0);
}

function excerpt(text: string): string {
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/** White, near-white, or vanished runs in a Word document. Comment text is included. */
export async function docxHiddenWarnings(bytes: Uint8Array): Promise<HiddenWarning[]> {
  const entries = await unzip(bytes);
  const warnings: HiddenWarning[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("word/") || !entry.name.endsWith(".xml")) continue;
    const xml = new TextDecoder().decode(entry.data);
    for (const run of xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const body = run[1];
      const props = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] ?? "";
      const text = textOf(body);
      if (!text) continue;
      const color = /\bw:color\b[^>]*\bw:val="([^"]+)"/i.exec(props)?.[1] ?? "";
      const vanished = flagOn(props, "vanish") || flagOn(props, "webHidden");
      const light = nearWhite(color);
      if (!vanished && !light) continue;
      const why = vanished ? "marked hidden" : `colored #${color.toUpperCase()}`;
      warnings.push({
        kind: "docx-invisible-text",
        detail: `${entry.name} has ${why} text: “${excerpt(text)}”.`,
      });
    }
  }
  return warnings;
}

function isHidden(tag: string): boolean {
  const value = /\bhidden="([^"]*)"/i.exec(tag)?.[1];
  if (!value) return false;
  return !/^(0|false|off)$/i.test(value);
}

function sheetName(workbook: string, id: string): string {
  const match = new RegExp(`<sheet\\b[^>]*name="([^"]*)"[^>]*r:id="${id}"`, "i").exec(workbook);
  return match?.[1] ?? id;
}

/** Hidden sheets, rows, and columns in an Excel workbook. Cell values are not reported. */
export async function xlsxHiddenWarnings(bytes: Uint8Array): Promise<HiddenWarning[]> {
  const entries = await unzip(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, new TextDecoder().decode(entry.data)]));
  const workbook = byName.get("xl/workbook.xml") ?? "";
  const rels = byName.get("xl/_rels/workbook.xml.rels") ?? "";
  const warnings: HiddenWarning[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = sheet[0];
    const state = /\bstate="([^"]*)"/i.exec(tag)?.[1] ?? "visible";
    const name = /\bname="([^"]*)"/i.exec(tag)?.[1] ?? "Unnamed sheet";
    if (state === "hidden" || state === "veryHidden") {
      warnings.push({
        kind: "xlsx-hidden-sheet",
        detail: `Sheet “${name}” is ${state === "veryHidden" ? "very hidden" : "hidden"}.`,
      });
    }
  }
  const targets = new Map<string, string>();
  for (const rel of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/i.exec(rel[0])?.[1];
    const target = /\bTarget="([^"]*)"/i.exec(rel[0])?.[1];
    if (id && target) targets.set(id, target.replace(/^\//, ""));
  }
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const id = /\br:id="([^"]*)"/i.exec(sheet[0])?.[1];
    if (!id) continue;
    const target = targets.get(id);
    if (!target) continue;
    const path = target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const xml = byName.get(path);
    if (!xml) continue;
    const name = /\bname="([^"]*)"/i.exec(sheet[0])?.[1] ?? sheetName(workbook, id);
    const rows = [...xml.matchAll(/<row\b[^>]*>/g)].filter((match) => isHidden(match[0]));
    if (rows.length > 0) {
      const numbers = rows
        .map((match) => /\br="(\d+)"/.exec(match[0])?.[1])
        .filter((item): item is string => Boolean(item));
      const listed = numbers.length > 8 ? `${numbers.slice(0, 8).join(", ")}…` : numbers.join(", ");
      warnings.push({
        kind: "xlsx-hidden-row",
        detail: `Sheet “${name}” has ${rows.length} hidden row${rows.length === 1 ? "" : "s"}${listed ? ` (${listed})` : ""}.`,
      });
    }
    for (const col of xml.matchAll(/<col\b[^>]*\/?>/g)) {
      if (!isHidden(col[0])) continue;
      const min = /\bmin="(\d+)"/.exec(col[0])?.[1] ?? "?";
      const max = /\bmax="(\d+)"/.exec(col[0])?.[1] ?? min;
      warnings.push({
        kind: "xlsx-hidden-column",
        detail: `Sheet “${name}” hides column${min === max ? "" : "s"} ${min === max ? min : `${min}–${max}`}.`,
      });
    }
  }
  return warnings;
}
