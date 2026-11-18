import type { RawMatch, Recognizer } from "../types.js";
import { Entity } from "../types.js";
import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";

/**
 * Legal-document identifiers. These are original to Isolated Sources.
 * Case and docket patterns cover federal "1:24-cv-04567" numbers, year-coded
 * state numbers, and labeled "Case No." / "Docket No." forms.
 */

const CASE_PATTERNS: readonly PatternDef[] = [
  {
    name: "federal",
    regex: /(?<!\w)\d{1,2}:\d{2}-[a-z]{2,6}-\d{3,7}(?:-[a-z]{2,5})?(?!\w)/i,
    score: 0.9,
  },
  {
    name: "state-year",
    regex: /(?<!\w)(?:19|20)\d{2}-[a-z]{1,6}-\d{3,8}(?!\w)/i,
    score: 0.7,
  },
  {
    name: "labeled",
    regex: /\bCase\s+No\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9:/-]{4,40})/i,
    score: 0.95,
    group: 1,
  },
];

const DOCKET_PATTERNS: readonly PatternDef[] = [
  {
    name: "labeled",
    regex: /\bDocket\s+(?:No\.?|Number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9:/-]{3,40})/i,
    score: 0.95,
    group: 1,
  },
  {
    name: "federal",
    regex: /(?<!\w)\d{1,2}:\d{2}-[a-z]{2,6}-\d{3,7}(?:-[a-z]{2,5})?(?!\w)/i,
    score: 0.4,
  },
];

const BATES_PATTERNS: readonly PatternDef[] = [
  {
    name: "labeled",
    regex: /\bBates\s*(?:No\.?|Number|#|Stamp)?\s*[:#]?\s*([A-Z]{2,12}[-_ ]?\d{3,12})\b/i,
    score: 0.95,
    group: 1,
  },
  {
    name: "stamped",
    regex: /(?<!\w)[A-Z]{2,10}-\d{5,12}(?!\w)/i,
    score: 0.7,
  },
];

const MATTER_PATTERNS: readonly PatternDef[] = [
  {
    name: "matter",
    regex: /\bMatter\s*(?:No\.?|Number|#|ID)?\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{2,24})/i,
    score: 0.95,
    group: 1,
  },
  {
    name: "file",
    regex: /\b(?:Our\s+File|File\s+No\.?|Client\s*(?:No\.?|Matter))\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{2,24})/i,
    score: 0.9,
    group: 1,
  },
];

export class CaseNumberRecognizer extends PatternRecognizer {
  readonly id = "case-number";
  readonly entityType = Entity.CASE_NUMBER;
  readonly context = ["case", "civil", "criminal", "docket"];
  readonly patterns = CASE_PATTERNS;
}

export class DocketNumberRecognizer extends PatternRecognizer {
  readonly id = "docket-number";
  readonly entityType = Entity.DOCKET_NUMBER;
  readonly context = ["docket", "pacer"];
  readonly patterns = DOCKET_PATTERNS;
}

export class BatesNumberRecognizer extends PatternRecognizer {
  readonly id = "bates-number";
  readonly entityType = Entity.BATES_NUMBER;
  readonly context = ["bates", "production", "stamp"];
  readonly patterns = BATES_PATTERNS;
}

export class MatterNumberRecognizer extends PatternRecognizer {
  readonly id = "matter-number";
  readonly entityType = Entity.MATTER_NUMBER;
  readonly context = ["matter", "file", "client"];
  readonly patterns = MATTER_PATTERNS;
}

const NAME =
  "[A-Z][A-Za-z'.-]+(?:\\s+[A-Z]\\.)?(?:\\s+[A-Z][A-Za-z'.-]+){0,3}";
const JUDGE_CUE =
  "(?:[Jj]udge|[Jj]ustice|[Mm]agistrate(?:\\s+[Jj]udge)?|[Tt]he\\s+[Hh]onorable|[Hh]onorable|[Hh]on\\.)";
const ROLE =
  "(?:[Pp]laintiffs?|[Dd]efendants?|[Pp]etitioners?|[Rr]espondents?|[Aa]ppellants?|[Aa]ppellees?)";

const STOP = new Set([
  "a", "an", "and", "or", "the", "filed", "file", "motion", "court", "that", "this",
  "for", "with", "from", "into", "under", "pursuant", "against", "upon", "is", "was",
  "were", "are", "be", "has", "had", "have", "not", "no", "of", "to", "in", "on", "by",
  "its", "their", "his", "her", "who", "which", "shall", "may", "must", "also", "any",
  "all", "such", "other", "than", "then", "there", "hereby", "respectfully", "submitted",
  "dated", "signed", "attorney", "counsel", "esq", "plaintiff", "defendant", "petitioner",
  "respondent", "appellant", "appellee", "plaintiffs", "defendants", "denied", "granted",
  "entered", "ordered", "before", "after", "judge", "justice", "honorable", "hon", "vs",
  "v", "county", "circuit", "district", "states", "state", "united", "america", "example",
]);

function acceptName(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts.length > 4) return false;
  for (const part of parts) {
    if (!/^[A-Z]/.test(part)) return false;
    const key = part.toLowerCase().replace(/\.$/, "");
    if (STOP.has(key)) return false;
  }
  return parts.length > 1 || (parts[0]?.length ?? 0) >= 2;
}

interface NameRule {
  source: string;
  flags: string;
  patternName: string;
  groups: number[];
}

const RULES: readonly NameRule[] = [
  {
    source: `\\b${JUDGE_CUE}\\s+(${NAME})\\b`,
    flags: "g",
    patternName: "judge",
    groups: [1],
  },
  {
    source: `\\b${ROLE}\\s+(${NAME})\\b`,
    flags: "g",
    patternName: "party-role",
    groups: [1],
  },
  {
    source: `\\b(${NAME}),?\\s+${ROLE}\\b`,
    flags: "g",
    patternName: "caption-role",
    groups: [1],
  },
  {
    source: `\\b(${NAME})\\s+[Vv]\\.?\\s+(${NAME})\\b`,
    flags: "g",
    patternName: "versus",
    groups: [1, 2],
  },
];

/**
 * Names introduced by a legal cue: "Judge Quinn", "Plaintiff Rivera",
 * a caption line ("Alex Rivera, Plaintiff"), or "Rivera v. Quinn".
 * The cue stays in the text. Only the name is reported.
 */
export class JudgePartyRecognizer implements Recognizer {
  readonly id = "judge-party";
  readonly entityType = Entity.PERSON;

  analyze(text: string): RawMatch[] {
    const found: RawMatch[] = [];
    for (const rule of RULES) {
      const re = new RegExp(rule.source, `${rule.flags}d`);
      for (const match of text.matchAll(re)) {
        const indices = (
          match as RegExpMatchArray & { indices?: Array<[number, number] | undefined> }
        ).indices;
        for (const group of rule.groups) {
          const indexed = indices?.[group];
          let start: number;
          let end: number;
          if (indexed && indexed[1] > indexed[0]) {
            start = indexed[0];
            end = indexed[1];
          } else if (match.index != null && match[group]) {
            const offset = match[0].indexOf(match[group]);
            if (offset < 0) continue;
            start = match.index + offset;
            end = start + match[group].length;
          } else {
            continue;
          }
          const name = text.slice(start, end);
          if (!acceptName(name)) continue;
          found.push({ start, end, score: 0.9, patternName: rule.patternName });
        }
      }
    }
    return found;
  }
}
