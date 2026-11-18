import type { RawMatch, Recognizer } from "../types.js";
import { Entity } from "../types.js";

const TITLES = ["Mr", "Mrs", "Ms", "Mx", "Dr", "Hon", "Judge", "Justice", "Honorable"];

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Names the user says must always be caught.
 * Matching is case-insensitive. A multi-word name also matches an optional
 * middle initial, "Last, First", the bare surname (3+ letters), and a title
 * plus surname ("Mr. Doe", "Doe").
 */
export function createKnownPartyRecognizer(parties: readonly string[]): Recognizer {
  const sources: string[] = [];
  for (const party of parties) {
    if (typeof party !== "string") continue;
    const cleaned = party.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    let parts = cleaned.split(" ");
    if (parts.length > 1 && /^(jr|sr|ii|iii|iv|v)\.?$/i.test(parts[parts.length - 1] ?? "")) {
      parts = parts.slice(0, -1);
    }
    const first = parts[0] ?? "";
    const last = parts[parts.length - 1] ?? "";
    if (!first || !last) continue;
    if (parts.length >= 2) {
      const middle = parts.slice(1, -1);
      const middleSource = middle.length
        ? middle.map((part) => `\\s+${escapeReg(part)}`).join("")
        : "(?:\\s+[A-Z]\\.?)?";
      sources.push(`${escapeReg(first)}${middleSource}\\s+${escapeReg(last)}`);
      sources.push(`${escapeReg(last)},\\s+${escapeReg(first)}`);
      if (last.length >= 3) {
        sources.push(escapeReg(last));
        for (const title of TITLES) {
          sources.push(`${escapeReg(title)}\\.?\\s+${escapeReg(last)}`);
        }
      }
    } else if (cleaned.length >= 2) {
      sources.push(escapeReg(cleaned));
    }
  }

  const unique = [...new Set(sources)].sort((a, b) => b.length - a.length);
  const source = unique.length
    ? `(?<![A-Za-z])(?:${unique.join("|")})(?![A-Za-z])`
    : null;

  return {
    id: "known-party",
    entityType: Entity.PERSON,
    analyze(text: string): RawMatch[] {
      if (!source) return [];
      const found: RawMatch[] = [];
      for (const match of text.matchAll(new RegExp(source, "gi"))) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (end > start) found.push({ start, end, score: 1, patternName: "known-party" });
      }
      return found;
    },
  };
}
