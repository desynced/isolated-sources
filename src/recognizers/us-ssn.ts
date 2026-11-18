import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), UsSsnRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/country_specific/us/us_ssn_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 * Invalid area/group/serial numbers and the published sample SSNs are dropped.
 */
const PATTERNS: readonly PatternDef[] = [
  { name: "SSN1 (very weak)", regex: /\b([0-9]{5})-([0-9]{4})\b/, score: 0.05 },
  { name: "SSN2 (very weak)", regex: /\b([0-9]{3})-([0-9]{6})\b/, score: 0.05 },
  { name: "SSN3 (very weak)", regex: /\b(([0-9]{3})-([0-9]{2})-([0-9]{4}))\b/, score: 0.05 },
  { name: "SSN4 (very weak)", regex: /\b[0-9]{9}\b/, score: 0.05 },
  { name: "SSN5 (medium)", regex: /\b([0-9]{3})[- .]([0-9]{2})[- .]([0-9]{4})\b/, score: 0.5 },
];

const SAMPLE_SSNS = new Set(["123456789", "987654320", "078051120"]);

export class UsSsnRecognizer extends PatternRecognizer {
  readonly id = "us-ssn";
  readonly entityType = Entity.US_SSN;
  readonly context = ["social", "security", "ssn", "ssns", "ssid"];
  readonly patterns = PATTERNS;

  override invalidate(value: string): boolean {
    const delimiters = new Set<string>();
    for (const char of value) {
      if (char === "." || char === "-" || char === " ") delimiters.add(char);
    }
    if (delimiters.size > 1) return true;

    const digits = value.replace(/\D/g, "");
    if (digits.length !== 9) return true;
    if ([...digits].every((char) => char === digits[0])) return true;
    if (digits.slice(3, 5) === "00" || digits.slice(5) === "0000") return true;
    if (digits.slice(0, 3) === "000" || digits.slice(0, 3) === "666") return true;
    if (SAMPLE_SSNS.has(digits)) return true;
    return false;
  }
}
