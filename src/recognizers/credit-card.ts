import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), CreditCardRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/generic/credit_card_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 * A Luhn checksum sets the score to 1, or drops the hit when it fails.
 */
const CARD =
  /\b(?!1\d{12}(?!\d))((4\d{3})|(5[0-5]\d{2})|(6\d{3})|(1\d{3})|(3\d{3}))[- ]?(\d{3,4})[- ]?(\d{3,4})[- ]?(\d{3,5})\b/;

export class CreditCardRecognizer extends PatternRecognizer {
  readonly id = "credit-card";
  readonly entityType = Entity.CREDIT_CARD;
  readonly context = [
    "credit",
    "card",
    "visa",
    "mastercard",
    "amex",
    "discover",
    "jcb",
    "diners",
    "maestro",
    "instapayment",
  ];
  readonly patterns: readonly PatternDef[] = [
    { name: "All Credit Cards (weak)", regex: CARD, score: 0.3 },
  ];

  override validate(value: string): boolean {
    const digits = value.replace(/[ -]/g, "");
    if (!/^\d{13,19}$/.test(digits)) return false;
    return luhn(digits);
  }
}

/** Same checksum Presidio applies after stripping spaces and dashes. */
export function luhn(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
