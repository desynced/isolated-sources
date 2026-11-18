import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), UsPassportRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/country_specific/us/us_passport_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 * Both patterns are weak until a context word such as "passport" is nearby.
 */
const PATTERNS: readonly PatternDef[] = [
  { name: "Passport (very weak)", regex: /\b[0-9]{9}\b/, score: 0.05 },
  { name: "Passport Next Generation (very weak)", regex: /\b[A-Z][0-9]{8}\b/i, score: 0.1 },
];

export class UsPassportRecognizer extends PatternRecognizer {
  readonly id = "us-passport";
  readonly entityType = Entity.US_PASSPORT;
  readonly context = ["us", "united", "states", "passport", "passport#", "travel", "document"];
  readonly patterns = PATTERNS;
}
