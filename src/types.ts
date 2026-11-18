/**
 * Public types for the scrubber. The library is local: recognizers and the
 * name-model plug-in must not make network calls.
 */

export const Entity = {
  PERSON: "PERSON",
  EMAIL_ADDRESS: "EMAIL_ADDRESS",
  PHONE_NUMBER: "PHONE_NUMBER",
  US_SSN: "US_SSN",
  CREDIT_CARD: "CREDIT_CARD",
  IBAN_CODE: "IBAN_CODE",
  IP_ADDRESS: "IP_ADDRESS",
  URL: "URL",
  DATE_OF_BIRTH: "DATE_OF_BIRTH",
  US_ADDRESS: "US_ADDRESS",
  US_DRIVER_LICENSE: "US_DRIVER_LICENSE",
  US_PASSPORT: "US_PASSPORT",
  CASE_NUMBER: "CASE_NUMBER",
  DOCKET_NUMBER: "DOCKET_NUMBER",
  BATES_NUMBER: "BATES_NUMBER",
  MATTER_NUMBER: "MATTER_NUMBER",
} as const;

export type BuiltinEntity = (typeof Entity)[keyof typeof Entity];

/** A span a recognizer found, before context boosting and overlap resolution. */
export interface RawMatch {
  start: number;
  end: number;
  /** Confidence before context boosting, from 0 to 1. */
  score: number;
  patternName?: string;
}

/**
 * Pattern or list recognizer. `analyze` is synchronous and must stay offline.
 * Add one through `ScrubOptions.extraRecognizers` or replace the set with
 * `ScrubOptions.recognizers`.
 */
export interface Recognizer {
  readonly id: string;
  readonly entityType: string;
  /**
   * Words that raise the score when they sit near a match.
   * A word of 4 or more characters matches as a substring of a token.
   * A word of 1–3 characters must equal the whole token.
   */
  readonly context?: readonly string[];
  /** Keep the match only when a context word is present. */
  readonly requiresContext?: boolean;
  analyze(text: string): readonly RawMatch[];
}

/** One person span from a local name model. Indexes are UTF-16 code units. */
export interface NameSpan {
  start: number;
  end: number;
  /** Confidence from 0 to 1. Spans at or below 0 are ignored. */
  score: number;
}

/**
 * Plug-in for a later in-browser name model (Transformers.js / ONNX).
 * `detect` may be sync or async. It must not contact the network.
 * `StubNameModel` returns no spans and does not load a model.
 */
export interface NameModel {
  readonly id: string;
  detect(text: string): readonly NameSpan[] | Promise<readonly NameSpan[]>;
}

export interface AnalysisFinding {
  entityType: string;
  start: number;
  end: number;
  /** Exact slice of the analyzed text. */
  text: string;
  /** Score after checksums and context boosting. */
  score: number;
  /** Recognizer id that won this span. */
  recognizer: string;
  /** Pattern name inside that recognizer, when it has one. */
  pattern?: string;
  /** Context word that boosted the score, when one did. */
  contextWord?: string;
  /** Nearby text for a "why flagged" panel. */
  contextSnippet: string;
}

export interface Finding extends AnalysisFinding {
  /** Stable token for this value inside the session. */
  placeholder: string;
}

export type ResidualFinding = AnalysisFinding;

export interface ScrubResult {
  text: string;
  /**
   * Placeholder → first-seen surface form.
   * The same value (case-insensitive, inner whitespace collapsed) always
   * receives the same placeholder for the life of the session.
   */
  mapping: Record<string, string>;
  findings: Finding[];
  /**
   * Fail-safe: spans in the scrubbed text that still look like identifiers.
   * Placeholder tokens are ignored. These are reported, not guessed at.
   */
  residual: ResidualFinding[];
}

export interface RestoreResult {
  text: string;
  /** Placeholders from the mapping that do not appear exactly. */
  missing: string[];
  /**
   * Placeholder-like strings that are not exact mapping keys
   * (wrong case, a space or hyphen, a missing bracket, or an unknown number).
   * They are left unchanged.
   */
  altered: string[];
}

export interface ScrubSession {
  /** Return the session token for this surface, creating one on first sight. */
  tokenFor(entityType: string, surface: string): string;
  /** Copy of placeholder → first-seen surface. */
  mapping(): Record<string, string>;
}

export interface ScrubOptions {
  /** Names that must be caught, including light variants such as "Mr. Doe". */
  knownParties?: readonly string[];
  /** Local name model. Defaults to a stub that finds nothing. */
  nameModel?: NameModel;
  /** Use these instead of the built-in recognizers. */
  recognizers?: readonly Recognizer[];
  /** Appended after the built-in (or replaced) list. */
  extraRecognizers?: readonly Recognizer[];
  /** Reuse tokens across calls. A fresh session is created when omitted. */
  session?: ScrubSession;
  /** Minimum score to replace. Default 0.4. */
  replaceThreshold?: number;
  /** Minimum score for the fail-safe rescan. Default 0.3. */
  flagThreshold?: number;
  /** Tokens before a match searched for context. Default 5. */
  contextPrefixCount?: number;
  /** Tokens after a match searched for context. Default 5. */
  contextSuffixCount?: number;
  /** Added when a context word hits. Default 0.35, matching Presidio. */
  contextSimilarityFactor?: number;
  /** Score floor after a context hit. Default 0.4, matching Presidio. */
  minScoreWithContext?: number;
  /**
   * For `analyze` only: keep matches at or above this score.
   * Defaults to 0 so callers can inspect weak hits.
   */
  threshold?: number;
}
