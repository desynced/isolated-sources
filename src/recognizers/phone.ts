import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Phone numbers. Presidio's PhoneRecognizer delegates to python-phonenumbers
 * rather than a regex (score 0.4, context words below). Those patterns are
 * not copied here. These expressions cover the written forms that library
 * finds in US and international text: separated NANP, a leading +, and a
 * compact digit run that needs a context word before it is replaced.
 */
const PATTERNS: readonly PatternDef[] = [
  {
    name: "NANP",
    regex: /(?<!\w)(?:\+?1[-.\s])?(?:\(\d{3}\)[-.\s]?|\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/,
    score: 0.4,
  },
  {
    name: "International",
    regex: /(?<!\w)\+\d{1,3}(?:[-.\s]\d{2,4}){2,5}\b/,
    score: 0.4,
  },
  {
    name: "Digits",
    regex: /(?<!\w)\d{10,11}\b/,
    score: 0.3,
  },
];

export class PhoneRecognizer extends PatternRecognizer {
  readonly id = "phone";
  readonly entityType = Entity.PHONE_NUMBER;
  readonly context = ["phone", "number", "telephone", "cell", "cellphone", "mobile", "call"];
  readonly patterns = PATTERNS;

  override invalidate(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return true;
    const national =
      digits.length === 11 && digits.startsWith("1")
        ? digits.slice(1)
        : digits.length === 10
          ? digits
          : null;
    if (national && (national[0]! < "2" || national[3]! < "2")) return true;
    return false;
  }
}
