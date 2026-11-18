import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), UsLicenseRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/country_specific/us/us_driver_license_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 * Presidio cites https://ntsi.com/drivers-license-format/ for the shapes.
 * One alternative in that file is missing a `[` (`A-Z]{2}...`). It is restored
 * here as `[A-Z]{2}`. Matches shorter than 6 characters or with fewer than
 * 4 digits are dropped so a citation like "Exhibit A1" is not a license.
 */
const ALPHANUMERIC = new RegExp(
  String.raw`\b([A-Z][0-9]{3,6}|[A-Z][0-9]{5,9}|[A-Z][0-9]{6,8}|[A-Z][0-9]{4,8}|[A-Z][0-9]{9,11}|[A-Z]{1,2}[0-9]{5,6}|H[0-9]{8}|V[0-9]{6}|X[0-9]{8}|[A-Z]{2}[0-9]{2,5}|[A-Z]{2}[0-9]{3,7}|[0-9]{2}[A-Z]{3}[0-9]{5,6}|[A-Z][0-9]{13,14}|[A-Z][0-9]{18}|[A-Z][0-9]{6}R|[A-Z][0-9]{9}|[A-Z][0-9]{1,12}|[0-9]{9}[A-Z]|[A-Z]{2}[0-9]{6}[A-Z]|[0-9]{8}[A-Z]{2}|[0-9]{3}[A-Z]{2}[0-9]{4}|[A-Z][0-9][A-Z][0-9][A-Z]|[0-9]{7,8}[A-Z])\b`,
  "i",
);

const DIGITS = /\b([0-9]{6,14}|[0-9]{16})\b/;

export class UsDriverLicenseRecognizer extends PatternRecognizer {
  readonly id = "us-driver-license";
  readonly entityType = Entity.US_DRIVER_LICENSE;
  readonly context = [
    "driver",
    "license",
    "permit",
    "lic",
    "identification",
    "dls",
    "cdls",
    "lic#",
    "driving",
  ];
  readonly patterns: readonly PatternDef[] = [
    { name: "Driver License - Alphanumeric (weak)", regex: ALPHANUMERIC, score: 0.3 },
    { name: "Driver License - Digits (very weak)", regex: DIGITS, score: 0.01 },
  ];

  override invalidate(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 4) return true;
    if (value.replace(/[^A-Za-z0-9]/g, "").length < 6) return true;
    return false;
  }
}
