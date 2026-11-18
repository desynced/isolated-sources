import { createSession, rescan, scrub } from "../../src/index.js";
import { Entity, type Finding, type ResidualFinding, type ScrubSession } from "../../src/index.js";

export interface ScrubState {
  source: string;
  parties: string[];
  session: ScrubSession;
  findings: Finding[];
  scrubbed: string;
  /**
   * Placeholders that are actually in the scrubbed text.
   * Un-flagged values stay out of this map so restore does not call them missing.
   * This is not `session.mapping()`, which remembers every token ever issued.
   */
  mapping: Record<string, string>;
  residual: ResidualFinding[];
}

export interface KindOption {
  value: string;
  label: string;
}

export const KINDS: readonly KindOption[] = [
  { value: Entity.PERSON, label: "Person" },
  { value: Entity.EMAIL_ADDRESS, label: "Email" },
  { value: Entity.PHONE_NUMBER, label: "Phone" },
  { value: Entity.US_SSN, label: "SSN" },
  { value: Entity.CREDIT_CARD, label: "Card number" },
  { value: Entity.IBAN_CODE, label: "IBAN" },
  { value: Entity.IP_ADDRESS, label: "IP address" },
  { value: Entity.URL, label: "URL" },
  { value: Entity.DATE_OF_BIRTH, label: "Date of birth" },
  { value: Entity.US_ADDRESS, label: "Street address" },
  { value: Entity.US_DRIVER_LICENSE, label: "Driver license" },
  { value: Entity.US_PASSPORT, label: "Passport" },
  { value: Entity.CASE_NUMBER, label: "Case number" },
  { value: Entity.DOCKET_NUMBER, label: "Docket number" },
  { value: Entity.BATES_NUMBER, label: "Bates number" },
  { value: Entity.MATTER_NUMBER, label: "Matter number" },
];

const ALLOWED = new Set(KINDS.map((kind) => kind.value));

export type AddResult =
  | { ok: true; state: ScrubState; start: number; end: number }
  | { ok: false; message: string };

interface Draft {
  source: string;
  parties: string[];
  session: ScrubSession;
  findings: Finding[];
}

export function parseParties(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function compose(source: string, findings: readonly Finding[]): string {
  const sorted = [...findings].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const finding of sorted) {
    out += source.slice(cursor, finding.start);
    out += finding.placeholder;
    cursor = finding.end;
  }
  return out + source.slice(cursor);
}

export function mappingFrom(findings: readonly Finding[]): Record<string, string> {
  const sorted = [...findings].sort((a, b) => a.start - b.start || a.end - b.end);
  const mapping: Record<string, string> = {};
  for (const finding of sorted) {
    if (!Object.prototype.hasOwnProperty.call(mapping, finding.placeholder)) {
      mapping[finding.placeholder] = finding.text;
    }
  }
  return mapping;
}

export function mapScrubbedSpan(
  source: string,
  findings: readonly Finding[],
  start: number,
  end: number,
): { start: number; end: number } | null {
  if (end <= start) return null;
  const sorted = [...findings].sort((a, b) => a.start - b.start || a.end - b.end);
  const pieces: { kind: "lit" | "ph"; s0: number; s1: number; o0: number }[] = [];
  let origin = 0;
  let scrub = 0;
  for (const finding of sorted) {
    if (finding.start > origin) {
      const len = finding.start - origin;
      pieces.push({ kind: "lit", s0: scrub, s1: scrub + len, o0: origin });
      scrub += len;
      origin = finding.start;
    }
    const len = finding.placeholder.length;
    pieces.push({ kind: "ph", s0: scrub, s1: scrub + len, o0: finding.start });
    scrub += len;
    origin = finding.end;
  }
  if (origin < source.length) {
    const len = source.length - origin;
    pieces.push({ kind: "lit", s0: scrub, s1: scrub + len, o0: origin });
  }

  let found: { start: number; end: number } | null = null;
  for (const piece of pieces) {
    const from = Math.max(start, piece.s0);
    const to = Math.min(end, piece.s1);
    if (from >= to) continue;
    if (piece.kind === "ph") return null;
    if (found) return null;
    found = { start: piece.o0 + (from - piece.s0), end: piece.o0 + (to - piece.s0) };
  }
  return found;
}

function snippet(text: string, start: number, end: number): string {
  const radius = 60;
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

function assertDisjoint(findings: readonly Finding[]): void {
  let end = -1;
  for (const finding of findings) {
    if (finding.start < end) throw new Error("Overlapping findings");
    if (finding.end <= finding.start) throw new Error("Empty finding");
    end = finding.end;
  }
}

async function finish(draft: Draft): Promise<ScrubState> {
  const findings = [...draft.findings].sort((a, b) => a.start - b.start || a.end - b.end);
  assertDisjoint(findings);
  const scrubbed = compose(draft.source, findings);
  const mapping = mappingFrom(findings);
  const residual = await rescan(scrubbed, { knownParties: draft.parties });
  return { ...draft, findings, scrubbed, mapping, residual };
}

export async function runScrub(source: string, parties: readonly string[]): Promise<ScrubState> {
  const session = createSession();
  const cleaned = parties.filter((party) => party.trim().length > 0);
  const result = await scrub(source, { knownParties: cleaned, session });
  return finish({
    source,
    parties: cleaned,
    session,
    findings: [...result.findings],
  });
}

export async function unflag(state: ScrubState, start: number, end: number): Promise<ScrubState> {
  const findings = state.findings.filter((item) => item.start !== start || item.end !== end);
  return finish({ ...state, findings });
}

function trimSpan(source: string, start: number, end: number): { start: number; end: number } | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  let from = Math.max(0, Math.min(start, source.length));
  let to = Math.max(0, Math.min(end, source.length));
  if (to < from) {
    const swap = from;
    from = to;
    to = swap;
  }
  while (from < to && /\s/.test(source[from] ?? "")) from += 1;
  while (to > from && /\s/.test(source[to - 1] ?? "")) to -= 1;
  if (from >= to) return null;
  return { start: from, end: to };
}

export async function addSpan(
  state: ScrubState,
  rawStart: number,
  rawEnd: number,
  entityType: string,
): Promise<AddResult> {
  const trimmed = trimSpan(state.source, rawStart, rawEnd);
  if (!trimmed) return { ok: false, message: "Select some text to flag." };
  if (!ALLOWED.has(entityType)) return { ok: false, message: "Choose a kind of identifier." };
  const { start, end } = trimmed;
  for (const item of state.findings) {
    if (start === item.start && end === item.end) {
      return { ok: false, message: "That span is already flagged." };
    }
    if (start < item.end && item.start < end) {
      return {
        ok: false,
        message: "That selection overlaps a flagged span. Un-flag it first, or select text outside it.",
      };
    }
  }
  const text = state.source.slice(start, end);
  const finding: Finding = {
    entityType,
    start,
    end,
    text,
    score: 1,
    recognizer: "you",
    pattern: "selection",
    contextSnippet: snippet(state.source, start, end),
    placeholder: state.session.tokenFor(entityType, text),
  };
  const next = await finish({ ...state, findings: [...state.findings, finding] });
  return { ok: true, state: next, start, end };
}

export async function addResidual(state: ScrubState, item: ResidualFinding): Promise<AddResult> {
  const mapped = mapScrubbedSpan(state.source, state.findings, item.start, item.end);
  if (!mapped) {
    return { ok: false, message: "That span could not be lined up with the source, so it was not added." };
  }
  return addSpan(state, mapped.start, mapped.end, item.entityType);
}
