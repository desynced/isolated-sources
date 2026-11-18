import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Numeric dates are ported from Microsoft Presidio (MIT), DateRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/generic/date_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 *
 * Presidio labels every date DATE_TIME and treats "date" itself as context.
 * This recognizer is dates of birth only, so a hit is kept only when a birth
 * cue is nearby ("dob", "born", "date of birth"). Filing dates stay put.
 * Month-name forms are an Isolated Sources addition for prose such as
 * "born on March 14, 1985".
 */
const MONTH =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

const PATTERNS: readonly PatternDef[] = [
  {
    name: "Datetime (ISO)",
    regex:
      /\b(?:(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))\b/,
    score: 0.8,
  },
  {
    name: "mm/dd/yyyy or mm/dd/yy",
    regex: /\b(([1-9]|0[1-9]|1[0-2])\/([1-9]|0[1-9]|[1-2][0-9]|3[0-1])\/(\d{4}|\d{2}))\b/,
    score: 0.6,
  },
  {
    name: "dd/mm/yyyy or dd/mm/yy",
    regex: /\b(([1-9]|0[1-9]|[1-2][0-9]|3[0-1])\/([1-9]|0[1-9]|1[0-2])\/(\d{4}|\d{2}))\b/,
    score: 0.6,
  },
  {
    name: "yyyy/mm/dd",
    regex: /\b(\d{4}\/([1-9]|0[1-9]|1[0-2])\/([1-9]|0[1-9]|[1-2][0-9]|3[0-1]))\b/,
    score: 0.6,
  },
  {
    name: "mm-dd-yyyy",
    regex: /\b(([1-9]|0[1-9]|1[0-2])-([1-9]|0[1-9]|[1-2][0-9]|3[0-1])-\d{4})\b/,
    score: 0.6,
  },
  {
    name: "dd-mm-yyyy",
    regex: /\b(([1-9]|0[1-9]|[1-2][0-9]|3[0-1])-([1-9]|0[1-9]|1[0-2])-\d{4})\b/,
    score: 0.6,
  },
  {
    name: "yyyy-mm-dd",
    regex: /\b(\d{4}-([1-9]|0[1-9]|1[0-2])-([1-9]|0[1-9]|[1-2][0-9]|3[0-1]))\b/,
    score: 0.6,
  },
  {
    name: "dd.mm.yyyy or dd.mm.yy",
    regex: /\b(([1-9]|0[1-9]|[1-2][0-9]|3[0-1])\.([1-9]|0[1-9]|1[0-2])\.(\d{4}|\d{2}))\b/,
    score: 0.6,
  },
  {
    name: "dd-MMM-yyyy or dd-MMM-yy",
    regex: new RegExp(
      String.raw`\b(([1-9]|0[1-9]|[1-2][0-9]|3[0-1])-(${MONTH})-(\d{4}|\d{2}))\b`,
      "i",
    ),
    score: 0.6,
  },
  {
    name: "Month dd, yyyy",
    regex: new RegExp(String.raw`\b((?:${MONTH})\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b`, "i"),
    score: 0.6,
  },
  {
    name: "dd Month yyyy",
    regex: new RegExp(
      String.raw`\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTH})\s+\d{4})\b`,
      "i",
    ),
    score: 0.6,
  },
];

export class DateOfBirthRecognizer extends PatternRecognizer {
  readonly id = "date-of-birth";
  readonly entityType = Entity.DATE_OF_BIRTH;
  readonly requiresContext = true;
  readonly context = ["birthday", "birth", "born", "dob", "d.o.b", "date of birth", "birth date"];
  readonly patterns = PATTERNS;
}
