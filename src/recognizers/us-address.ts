import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * US street addresses. Presidio has no dedicated address regex; this one is
 * original. It looks for a street number, a street suffix, a city, a USPS
 * state code, and a ZIP. A P.O. Box line is accepted on the same terms.
 */
const SUFFIX = [
  "Street",
  "Avenue",
  "Boulevard",
  "Parkway",
  "Highway",
  "Terrace",
  "Circle",
  "Place",
  "Court",
  "Drive",
  "Trail",
  "Lane",
  "Road",
  "Way",
  "Pkwy",
  "Hwy",
  "Ter",
  "Cir",
  "Blvd",
  "Ave",
  "St",
  "Dr",
  "Ct",
  "Pl",
  "Ln",
  "Rd",
  "Trl",
].join("|");

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
].join("|");

const CITY = String.raw`[A-Za-z][A-Za-z.'-]{1,}(?:\s+[A-Za-z][A-Za-z.'-]{1,}){0,3}`;
const ZIP = String.raw`\d{5}(?:-\d{4})?`;

const STREET = new RegExp(
  String.raw`(?<!\w)\d{1,6}\s+(?:[A-Za-z0-9][A-Za-z0-9.'-]*\s+){1,6}(?:${SUFFIX})\.?(?:,\s*|\s+)(?:(?:Apt|Apartment|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+\s*,?\s*)?${CITY},?\s+(?:${STATES})\s+${ZIP}(?!\w)`,
  "i",
);

const PO_BOX = new RegExp(
  String.raw`(?<!\w)P\.?\s*O\.?\s+Box\s+\d{1,6},?\s+${CITY},?\s+(?:${STATES})\s+${ZIP}(?!\w)`,
  "i",
);

const PATTERNS: readonly PatternDef[] = [
  { name: "US street address", regex: STREET, score: 0.75 },
  { name: "US PO Box", regex: PO_BOX, score: 0.75 },
];

export class UsAddressRecognizer extends PatternRecognizer {
  readonly id = "us-address";
  readonly entityType = Entity.US_ADDRESS;
  readonly context = ["address", "street", "residence", "resides", "lives", "lived", "home"];
  readonly patterns = PATTERNS;
}
