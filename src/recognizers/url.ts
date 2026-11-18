import { URL_BODY_SOURCE } from "./url-pattern.js";
import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), UrlRecognizer.
 * The body pattern is CommonRegex, (c) 2014 Madison May, MIT, via Presidio.
 * Source: presidio_analyzer/predefined_recognizers/generic/url_recognizer.py
 * See NOTICE. Inline `(?i)` is applied as the JavaScript `i` flag.
 */
function compile(source: string): RegExp {
  return new RegExp(source, "i");
}

const PATTERNS: readonly PatternDef[] = [
  { name: "Standard Url", regex: compile(`(?:https?://)${URL_BODY_SOURCE}`), score: 0.6 },
  { name: "Non schema URL", regex: compile(URL_BODY_SOURCE), score: 0.5 },
  {
    name: "Quoted URL",
    regex: compile(`["'](https?://${URL_BODY_SOURCE})["']`),
    score: 0.6,
    group: 1,
  },
  {
    name: "Quoted Non-schema URL",
    regex: compile(`["'](${URL_BODY_SOURCE})["']`),
    score: 0.5,
    group: 1,
  },
];

export class UrlRecognizer extends PatternRecognizer {
  readonly id = "url";
  readonly entityType = Entity.URL;
  readonly context = ["url", "website", "link"];
  readonly patterns = PATTERNS;

  override analyze(text: string) {
    return super.analyze(text).flatMap((match) => {
      let end = match.end;
      while (end > match.start && /[.,;:!?)]/.test(text[end - 1] ?? "")) end -= 1;
      if (end <= match.start) return [];
      return [end === match.end ? match : { ...match, end }];
    });
  }
}
