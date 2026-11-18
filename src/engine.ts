import { contextWindow, supportiveContext } from "./context.js";
import { StubNameModel } from "./name-model.js";
import { resolveOverlaps } from "./overlap.js";
import { createDefaultRecognizers } from "./recognizers/defaults.js";
import { createKnownPartyRecognizer } from "./recognizers/known-party.js";
import { createSession } from "./session.js";
import { Entity, type AnalysisFinding, type Finding, type NameModel, type Recognizer, type ResidualFinding, type ScrubOptions, type ScrubResult, type ScrubSession } from "./types.js";

interface Resolved {
  recognizers: readonly Recognizer[];
  extraRecognizers: readonly Recognizer[];
  knownParties: readonly string[];
  nameModel: NameModel;
  replaceThreshold: number;
  flagThreshold: number;
  contextPrefixCount: number;
  contextSuffixCount: number;
  contextSimilarityFactor: number;
  minScoreWithContext: number;
}

interface Scored {
  entityType: string;
  start: number;
  end: number;
  score: number;
  recognizer: string;
  pattern?: string;
  contextWord?: string;
}

const PLACEHOLDER = /\[[A-Z][A-Z0-9]*_\d+\]/g;

function assertText(text: string, method: string): void {
  if (typeof text !== "string") throw new TypeError(`${method}() expects a string`);
}

function unit(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new RangeError(`${name} must be a number from 0 to 1`);
  }
  return resolved;
}

function count(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0 || resolved > 50) {
    throw new RangeError(`${name} must be an integer from 0 to 50`);
  }
  return resolved;
}

function resolveOptions(options: ScrubOptions | undefined): Resolved {
  const knownParties = (options?.knownParties ?? []).filter(
    (party): party is string => typeof party === "string" && party.trim().length > 0,
  );
  return {
    recognizers: options?.recognizers ?? createDefaultRecognizers(),
    extraRecognizers: options?.extraRecognizers ?? [],
    knownParties,
    nameModel: options?.nameModel ?? new StubNameModel(),
    replaceThreshold: unit("replaceThreshold", options?.replaceThreshold, 0.4),
    flagThreshold: unit("flagThreshold", options?.flagThreshold, 0.3),
    contextPrefixCount: count("contextPrefixCount", options?.contextPrefixCount, 5),
    contextSuffixCount: count("contextSuffixCount", options?.contextSuffixCount, 5),
    contextSimilarityFactor: unit("contextSimilarityFactor", options?.contextSimilarityFactor, 0.35),
    minScoreWithContext: unit("minScoreWithContext", options?.minScoreWithContext, 0.4),
  };
}

function snippet(text: string, start: number, end: number): string {
  const radius = 60;
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

function toFinding(text: string, item: Scored): AnalysisFinding {
  return {
    entityType: item.entityType,
    start: item.start,
    end: item.end,
    text: text.slice(item.start, item.end),
    score: item.score,
    recognizer: item.recognizer,
    pattern: item.pattern,
    contextWord: item.contextWord,
    contextSnippet: snippet(text, item.start, item.end),
  };
}

async function collect(text: string, options: Resolved): Promise<Scored[]> {
  const pending: Scored[] = [];
  const recognizers: Recognizer[] = [
    ...options.recognizers,
    ...options.extraRecognizers,
  ];
  if (options.knownParties.length > 0) {
    recognizers.push(createKnownPartyRecognizer(options.knownParties));
  }

  for (const recognizer of recognizers) {
    for (const match of recognizer.analyze(text)) {
      if (!Number.isFinite(match.score) || match.score <= 0) continue;
      if (match.start < 0 || match.end > text.length || match.end <= match.start) continue;
      const view = contextWindow(
        text,
        match.start,
        match.end,
        options.contextPrefixCount,
        options.contextSuffixCount,
      );
      const hit = supportiveContext(view.tokens, view.phraseWindow, recognizer.context);
      if (recognizer.requiresContext && !hit) continue;
      let score = match.score;
      if (hit) {
        score = Math.min(
          1,
          Math.max(match.score + options.contextSimilarityFactor, options.minScoreWithContext),
        );
      }
      pending.push({
        entityType: recognizer.entityType,
        start: match.start,
        end: match.end,
        score,
        recognizer: recognizer.id,
        pattern: match.patternName,
        contextWord: hit,
      });
    }
  }

  const spans = await Promise.resolve(options.nameModel.detect(text));
  if (!Array.isArray(spans)) {
    throw new TypeError("NameModel.detect() must return an array of spans");
  }
  for (const span of spans) {
    if (!span || typeof span.start !== "number" || typeof span.end !== "number") continue;
    if (!Number.isFinite(span.score) || span.score <= 0) continue;
    if (span.start < 0 || span.end > text.length || span.end <= span.start) continue;
    pending.push({
      entityType: Entity.PERSON,
      start: span.start,
      end: span.end,
      score: Math.min(1, span.score),
      recognizer: options.nameModel.id || "name-model",
      pattern: "name-model",
    });
  }
  return pending;
}

function placeholderSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}

function hidesPlaceholder(start: number, end: number, spans: readonly { start: number; end: number }[]): boolean {
  return spans.some((span) => start < span.end && span.start < end);
}

async function flagResidual(text: string, options: Resolved): Promise<ResidualFinding[]> {
  const hidden = placeholderSpans(text);
  const visible = (await collect(text, options)).filter(
    (item) => !hidesPlaceholder(item.start, item.end, hidden),
  );
  return resolveOverlaps(visible.filter((item) => item.score >= options.flagThreshold)).map((item) =>
    toFinding(text, item),
  );
}

/** Run recognizers and return overlap-resolved hits at or above `threshold` (default 0). */
export async function analyze(
  text: string,
  options?: ScrubOptions,
): Promise<AnalysisFinding[]> {
  assertText(text, "analyze");
  const resolved = resolveOptions(options);
  const threshold = unit("threshold", options?.threshold, 0);
  const chosen = resolveOverlaps(
    (await collect(text, resolved)).filter((item) => item.score >= threshold),
  );
  return chosen.map((item) => toFinding(text, item));
}

/**
 * Replace identifiers with stable placeholders.
 * The same value maps to the same token within `session`.
 * `residual` is a second pass over the scrubbed text.
 */
export async function scrub(text: string, options?: ScrubOptions): Promise<ScrubResult> {
  assertText(text, "scrub");
  const resolved = resolveOptions(options);
  const session: ScrubSession = options?.session ?? createSession();
  const chosen = resolveOverlaps(
    (await collect(text, resolved)).filter((item) => item.score >= resolved.replaceThreshold),
  ).sort((a, b) => a.start - b.start || a.end - b.end);

  const findings: Finding[] = chosen.map((item) => {
    const surface = text.slice(item.start, item.end);
    return {
      ...toFinding(text, item),
      text: surface,
      placeholder: session.tokenFor(item.entityType, surface),
    };
  });

  let scrubbed = text;
  for (const finding of [...findings].sort((a, b) => b.start - a.start)) {
    scrubbed = scrubbed.slice(0, finding.start) + finding.placeholder + scrubbed.slice(finding.end);
  }

  const residual = await flagResidual(scrubbed, resolved);
  return {
    text: scrubbed,
    mapping: session.mapping(),
    findings,
    residual,
  };
}

/** Re-scan text and report spans that still look like identifiers. */
export async function rescan(text: string, options?: ScrubOptions): Promise<ResidualFinding[]> {
  assertText(text, "rescan");
  return flagResidual(text, resolveOptions(options));
}
