import type { RawMatch, Recognizer } from "./types.js";

export interface PatternDef {
  name: string;
  regex: RegExp;
  /** Base confidence from 0 to 1, before context boosting. */
  score: number;
  /** Capture group to emit. 0 is the full match. */
  group?: number;
}

/**
 * Shared scanner for Presidio-style pattern recognizers.
 * `validate` returning true raises the score to 1 (checksum passed).
 * `validate` returning false, or `invalidate` returning true, drops the hit.
 */
export abstract class PatternRecognizer implements Recognizer {
  abstract readonly id: string;
  abstract readonly entityType: string;
  readonly context: readonly string[] = [];
  readonly requiresContext: boolean = false;
  abstract readonly patterns: readonly PatternDef[];

  analyze(text: string): RawMatch[] {
    const found: RawMatch[] = [];
    for (const pattern of this.patterns) found.push(...this.scan(text, pattern));
    return found;
  }

  protected scan(text: string, pattern: PatternDef): RawMatch[] {
    const re = new RegExp(pattern.regex.source, ensureFlags(pattern.regex.flags));
    const group = pattern.group ?? 0;
    const out: RawMatch[] = [];
    for (const match of text.matchAll(re)) {
      const span = groupSpan(match, group);
      if (!span) continue;
      const [start, end] = span;
      const value = text.slice(start, end);
      if (!value) continue;
      let score = pattern.score;
      const validation = this.validate(value);
      if (validation === true) score = 1;
      else if (validation === false) score = 0;
      if (score > 0 && this.invalidate(value)) score = 0;
      if (score > 0) out.push({ start, end, score, patternName: pattern.name });
    }
    return out;
  }

  validate(_value: string): boolean | null {
    return null;
  }

  invalidate(_value: string): boolean {
    return false;
  }
}

function ensureFlags(flags: string): string {
  let next = flags.replace(/g/g, "");
  if (!next.includes("d")) next += "d";
  if (!next.includes("g")) next += "g";
  return next;
}

function groupSpan(match: RegExpMatchArray, group: number): [number, number] | null {
  const indices = (match as RegExpMatchArray & { indices?: Array<[number, number] | undefined> })
    .indices;
  const indexed = indices?.[group];
  if (indexed && indexed[0] >= 0 && indexed[1] > indexed[0]) return [indexed[0], indexed[1]];
  if (match.index == null) return null;
  if (group === 0) return [match.index, match.index + match[0].length];
  const piece = match[group];
  if (piece == null) return null;
  const offset = match[0].indexOf(piece);
  if (offset < 0) return null;
  return [match.index + offset, match.index + offset + piece.length];
}
