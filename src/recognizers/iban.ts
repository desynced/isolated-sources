import { IBAN_COUNTRY_REGEX } from "./iban-patterns.js";
import type { RawMatch, Recognizer } from "../types.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), IbanRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/generic/iban_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 * Mod-97 checksum plus the per-country shape. A passing checksum scores 1.
 */
const GENERIC =
  /(?<![A-Z0-9])([A-Z]{2}[0-9]{2}(?:[ -]?[A-Z0-9]{4}){2,6})((?:[ -]?[A-Z0-9]{4})?)((?:[ -]?[A-Z0-9]{1,3})?)(?![A-Z0-9])/i;

export class IbanRecognizer implements Recognizer {
  readonly id = "iban";
  readonly entityType = Entity.IBAN_CODE;
  readonly context = ["iban", "bank", "transaction"];

  analyze(text: string): RawMatch[] {
    const results: RawMatch[] = [];
    const re = new RegExp(GENERIC.source, "gid");
    for (const match of text.matchAll(re)) {
      if (match.index == null) continue;
      for (let group = match.length - 1; group >= 1; group -= 1) {
        let consumed = "";
        for (let i = 1; i <= group; i += 1) consumed += match[i] ?? "";
        if (!consumed) continue;
        const start = match.index;
        const end = start + consumed.length;
        const current = text.slice(start, end);
        if (!ibanIsValid(current)) continue;
        results.push({ start, end, score: 1, patternName: "IBAN Generic" });
        break;
      }
    }
    return results;
  }
}

export function ibanIsValid(value: string): boolean {
  const compact = value.replace(/[ -]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  if (!checksumMatches(compact)) return false;
  return countryShapeMatches(compact);
}

function checksumMatches(iban: string): boolean {
  const expected = iban.slice(2, 4);
  const rearranged = `${iban.slice(4)}${iban.slice(0, 2)}00`;
  let numeric = "";
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) numeric += char;
    else if (code >= 65 && code <= 90) numeric += String(code - 55);
    else return false;
  }
  const mod = BigInt(numeric) % 97n;
  const check = (98n - mod).toString().padStart(2, "0");
  return check === expected;
}

function countryShapeMatches(iban: string): boolean {
  const country = IBAN_COUNTRY_REGEX[iban.slice(0, 2)];
  if (!country) return false;
  const match = new RegExp(`^${country}`, "i").exec(iban);
  return match != null && match[0].length === iban.length;
}
