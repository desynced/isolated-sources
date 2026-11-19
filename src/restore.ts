import type { RestoreResult } from "./types.js";

const BARE =
  /\b(?:PERSON|EMAIL|PHONE|SSN|CREDIT_CARD|IBAN|IP|URL|DOB|ADDRESS|DL|PASSPORT|CASE|DOCKET|BATES|MATTER)[ _-]?\d+\b/g;

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePlaceholder(value: string): string {
  return value
    .replace(/[[\]]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Swap exact placeholders back to their mapped text.
 * Near-misses are reported and left as written. Nothing is fuzzy-matched.
 */
export function restore(output: string, mapping: Record<string, string>): RestoreResult {
  if (typeof output !== "string") {
    throw new TypeError("restore() expects a string");
  }
  if (mapping == null || typeof mapping !== "object") {
    throw new TypeError("restore() expects a mapping object");
  }

  const keys = Object.keys(mapping).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const exactSpans: { start: number; end: number }[] = [];
  for (const key of keys) {
    let from = 0;
    while (from <= output.length) {
      const index = output.indexOf(key, from);
      if (index < 0) break;
      exactSpans.push({ start: index, end: index + key.length });
      from = index + key.length;
    }
  }
  const covered = (start: number, end: number) =>
    exactSpans.some((span) => start >= span.start && end <= span.end);

  let text = output;
  if (keys.length > 0) {
    const pattern = new RegExp(keys.map(escapeReg).join("|"), "g");
    text = output.replace(pattern, (match) =>
      Object.prototype.hasOwnProperty.call(mapping, match) ? mapping[match] : match,
    );
  }

  const missing = keys.filter((key) => !output.includes(key)).sort();
  const altered = new Set<string>();
  const known = new Set(keys.map(normalizePlaceholder));
  const brackets: { start: number; end: number }[] = [];

  for (const match of output.matchAll(/\[[^\][\n]{1,80}\]/g)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    brackets.push({ start, end });
    if (Object.prototype.hasOwnProperty.call(mapping, raw)) continue;
    if (covered(start, end)) continue;
    const inner = raw.slice(1, -1).trim();
    const shaped = /^[A-Za-z][A-Za-z0-9]*[ _-]\d+$/.test(inner);
    if (shaped || known.has(normalizePlaceholder(inner))) altered.add(raw);
  }

  for (const match of output.matchAll(BARE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (covered(start, end)) continue;
    if (brackets.some((span) => start >= span.start && end <= span.end)) continue;
    // Ordinary words such as "SSN 123" share the prefix shape. Only a near-miss
    // of a placeholder this session actually issued is reported.
    if (!known.has(normalizePlaceholder(match[0]))) continue;
    altered.add(match[0]);
  }

  return { text, missing, altered: [...altered].sort() };
}
