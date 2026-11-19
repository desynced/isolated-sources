import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import type { HiddenWarning } from "./types.js";

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TextMark {
  index: number;
  box: Box;
  text: string;
  light: boolean;
}

interface Cover {
  index: number;
  box: Box;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function apply(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function nearWhite(rgb: number[]): boolean {
  return rgb.length >= 3 && rgb[0] >= 0.9 && rgb[1] >= 0.9 && rgb[2] >= 0.9;
}

function nearBlack(rgb: number[]): boolean {
  return rgb.length >= 3 && rgb[0] <= 0.15 && rgb[1] <= 0.15 && rgb[2] <= 0.15;
}

function hexText(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length < 2 || clean.length % 2 !== 0) return "";
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const value = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(value)) return "";
    bytes[i] = value;
  }
  return new TextDecoder().decode(bytes).replace(/\s+/g, " ").trim();
}

type Operand = number | string | Operand[];

function lex(source: string): { op: string; args: Operand[] }[] {
  const ops: { op: string; args: Operand[] }[] = [];
  const args: Operand[] = [];
  let i = 0;
  const pushString = (value: string): void => {
    args.push(value);
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\0") {
      i += 1;
      continue;
    }
    if (ch === "%") {
      while (i < source.length && source[i] !== "\n" && source[i] !== "\r") i += 1;
      continue;
    }
    if (ch === "(") {
      i += 1;
      let value = "";
      let depth = 1;
      while (i < source.length && depth > 0) {
        const cur = source[i];
        if (cur === "\\") {
          const next = source[i + 1] ?? "";
          const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
          value += map[next] ?? next;
          i += 2;
          continue;
        }
        if (cur === "(") depth += 1;
        if (cur === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
        value += cur;
        i += 1;
      }
      i += 1;
      pushString(value);
      continue;
    }
    if (ch === "<" && source[i + 1] !== "<") {
      const end = source.indexOf(">", i + 1);
      if (end < 0) break;
      pushString(hexText(source.slice(i + 1, end)));
      i = end + 1;
      continue;
    }
    if (ch === "<" && source[i + 1] === "<") {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        if (source[i] === "<" && source[i + 1] === "<") {
          depth += 1;
          i += 2;
          continue;
        }
        if (source[i] === ">" && source[i + 1] === ">") {
          depth -= 1;
          i += 2;
          continue;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "[") {
      const collected = readArray(source, i);
      args.push(collected.value);
      i = collected.next;
      continue;
    }
    if (ch === "]") {
      i += 1;
      continue;
    }
    if (ch === "/") {
      i += 1;
      const start = i;
      while (i < source.length && !/[\s<>\[\]()/%]/.test(source[i])) i += 1;
      args.push(source.slice(start, i));
      continue;
    }
    if (/[0-9+.\-]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && /[0-9.+\-eE]/.test(source[i])) i += 1;
      const value = Number(source.slice(start, i));
      if (!Number.isNaN(value)) args.push(value);
      continue;
    }
    const start = i;
    while (i < source.length && /[A-Za-z*'"]/.test(source[i])) i += 1;
    const op = source.slice(start, i);
    if (op) {
      ops.push({ op, args: args.splice(0, args.length) });
    } else {
      i += 1;
    }
  }
  return ops;
}

function readArray(source: string, start: number): { value: Operand[]; next: number } {
  let i = start + 1;
  const value: Operand[] = [];
  while (i < source.length && source[i] !== "]") {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i += 1;
      continue;
    }
    if (ch === "<" && source[i + 1] !== "<") {
      const end = source.indexOf(">", i + 1);
      value.push(hexText(source.slice(i + 1, end)));
      i = end + 1;
      continue;
    }
    if (ch === "(") {
      let depth = 1;
      let text = "";
      i += 1;
      while (i < source.length && depth > 0) {
        if (source[i] === "\\") {
          text += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (source[i] === "(") depth += 1;
        if (source[i] === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
        text += source[i];
        i += 1;
      }
      i += 1;
      value.push(text);
      continue;
    }
    if (/[0-9+.\-]/.test(ch)) {
      const numStart = i;
      i += 1;
      while (i < source.length && /[0-9.+\-]/.test(source[i])) i += 1;
      value.push(Number(source.slice(numStart, i)));
      continue;
    }
    i += 1;
  }
  return { value, next: Math.min(source.length, i + 1) };
}

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

function interpret(source: string): { covered: TextMark[]; light: TextMark[] } {
  const covered: TextMark[] = [];
  const light: TextMark[] = [];
  let ctm = { ...IDENTITY };
  let fill = [0, 0, 0];
  let renderMode = 0;
  let fontSize = 12;
  let textMatrix = { ...IDENTITY };
  const saved: { ctm: Matrix; fill: number[]; renderMode: number }[] = [];
  const path: { x: number; y: number }[] = [];
  const texts: TextMark[] = [];
  const covers: Cover[] = [];
  let step = 0;

  const textBox = (text: string): Box => {
    const origin = apply(ctm, textMatrix.e, textMatrix.f);
    const scale = Math.max(0.2, Math.hypot(textMatrix.a, textMatrix.b) || 1);
    const width = Math.max(fontSize * 0.4, text.length * fontSize * 0.5 * scale);
    const height = Math.max(1, fontSize * scale);
    return { x: origin.x, y: origin.y, w: width, h: height };
  };

  for (const { op, args } of lex(source)) {
    step += 1;
    if (op === "q") {
      saved.push({ ctm: { ...ctm }, fill: [...fill], renderMode });
      continue;
    }
    if (op === "Q") {
      const prev = saved.pop();
      if (prev) {
        ctm = prev.ctm;
        fill = prev.fill;
        renderMode = prev.renderMode;
      }
      continue;
    }
    if (op === "cm" && args.length >= 6 && args.every((item) => typeof item === "number")) {
      const [a, b, c, d, e, f] = args as number[];
      ctm = multiply(ctm, { a, b, c, d, e, f });
      continue;
    }
    if (op === "rg" && args.length >= 3) {
      fill = args.slice(0, 3).map((item) => (typeof item === "number" ? item : 0));
      continue;
    }
    if (op === "g" && typeof args[0] === "number") {
      fill = [args[0], args[0], args[0]];
      continue;
    }
    if (op === "k" && args.length >= 4 && args.every((item) => typeof item === "number")) {
      const [c, m, y, k] = args as number[];
      fill = [1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k)];
      continue;
    }
    if (op === "Tr" && typeof args[0] === "number") {
      renderMode = args[0];
      continue;
    }
    if (op === "BT") {
      textMatrix = { ...IDENTITY };
      continue;
    }
    if (op === "ET") continue;
    if (op === "Tm" && args.length >= 6 && args.every((item) => typeof item === "number")) {
      const [a, b, c, d, e, f] = args as number[];
      textMatrix = { a, b, c, d, e, f };
      continue;
    }
    if (op === "Td" || op === "TD") {
      const x = typeof args[0] === "number" ? args[0] : 0;
      const y = typeof args[1] === "number" ? args[1] : 0;
      textMatrix = { ...textMatrix, e: textMatrix.e + x, f: textMatrix.f + y };
      continue;
    }
    if (op === "Tf" && typeof args[args.length - 1] === "number") {
      fontSize = args[args.length - 1] as number;
      continue;
    }
    if (op === "Tj" || op === "'" || op === '"') {
      const text = args.find((item) => typeof item === "string") ?? "";
      if (typeof text === "string" && text.trim()) {
        const mark: TextMark = {
          index: step,
          box: textBox(text),
          text,
          light: renderMode === 3 || nearWhite(fill),
        };
        texts.push(mark);
        if (mark.light) light.push(mark);
      }
      continue;
    }
    if (op === "TJ" && Array.isArray(args[0])) {
      const text = args[0].filter((item) => typeof item === "string").join("");
      if (text.trim()) {
        const mark: TextMark = {
          index: step,
          box: textBox(text),
          text,
          light: renderMode === 3 || nearWhite(fill),
        };
        texts.push(mark);
        if (mark.light) light.push(mark);
      }
      continue;
    }
    if (op === "m" || op === "l") {
      const x = typeof args[0] === "number" ? args[0] : 0;
      const y = typeof args[1] === "number" ? args[1] : 0;
      path.push(apply(ctm, x, y));
      continue;
    }
    if (op === "re" && args.length >= 4 && args.every((item) => typeof item === "number")) {
      const [x, y, w, h] = args as number[];
      path.push(apply(ctm, x, y), apply(ctm, x + w, y + h));
      continue;
    }
    if (op === "f" || op === "F" || op === "f*" || op === "B" || op === "B*" || op === "b" || op === "b*") {
      if (path.length > 0 && nearBlack(fill)) {
        const xs = path.map((point) => point.x);
        const ys = path.map((point) => point.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        covers.push({
          index: step,
          box: { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY },
        });
      }
      path.length = 0;
      continue;
    }
    if (op === "n" || op === "S" || op === "s") path.length = 0;
  }

  for (const text of texts) {
    if (covers.some((cover) => cover.index > text.index && overlaps(cover.box, text.box))) covered.push(text);
  }
  return { covered, light };
}

async function pageStreams(doc: PDFDocument, index: number): Promise<Uint8Array[]> {
  const page = doc.getPage(index);
  const contents = page.node.lookup(PDFName.of("Contents"));
  const items = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  const out: Uint8Array[] = [];
  for (const item of items) {
    const stream = item instanceof PDFRawStream ? item : doc.context.lookup(item);
    if (!(stream instanceof PDFRawStream)) continue;
    try {
      out.push(decodePDFRawStream(stream).decode());
    } catch {
      out.push(stream.getContents());
    }
  }
  return out;
}

/** Best-effort look for text under dark fills and for light or invisible text. */
export async function pdfHiddenWarnings(bytes: Uint8Array): Promise<HiddenWarning[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const warnings: HiddenWarning[] = [];
  for (let index = 0; index < doc.getPageCount(); index++) {
    const streams = await pageStreams(doc, index);
    const source = streams.map((stream) => latin1(stream)).join("\n");
    const { covered, light } = interpret(source);
    const page = index + 1;
    for (const mark of covered) {
      warnings.push({
        kind: "pdf-covered-text",
        detail: `Page ${page} has text under a dark filled shape: “${excerpt(mark.text)}”.`,
      });
    }
    for (const mark of light) {
      warnings.push({
        kind: "pdf-invisible-text",
        detail: `Page ${page} has light or invisible text: “${excerpt(mark.text)}”.`,
      });
    }
  }
  return warnings;
}
