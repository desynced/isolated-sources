import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), EmailRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/generic/email_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 *
 * Presidio confirms the domain with tldextract. This port accepts a dotted
 * hostname whose last label is a letter TLD of 2–63 characters, which is
 * enough to drop `user@localhost` without shipping a public-suffix list.
 */
const EMAIL = /\b((([!#$%&'*+\-/=?^_`{|}~\w])|([!#$%&'*+\-/=?^_`{|}~\w][!#$%&'*+\-/=?^_`{|}~\.\w]{0,}[!#$%&'*+\-/=?^_`{|}~\w]))[@]\w+(?:-+\w+)*(?:\.\w+(?:-+\w+)*)+)\b/;

export class EmailRecognizer extends PatternRecognizer {
  readonly id = "email";
  readonly entityType = Entity.EMAIL_ADDRESS;
  readonly context = ["email"];
  readonly patterns: readonly PatternDef[] = [
    { name: "Email (Medium)", regex: EMAIL, score: 0.5 },
  ];

  override validate(value: string): boolean {
    const at = value.lastIndexOf("@");
    if (at <= 0 || at >= value.length - 1) return false;
    const labels = value.slice(at + 1).split(".");
    if (labels.length < 2) return false;
    const tld = labels[labels.length - 1] ?? "";
    if (!/^[A-Za-z]{2,63}$/.test(tld)) return false;
    return labels.every((label) => label.length > 0 && !label.startsWith("-") && !label.endsWith("-"));
  }
}
