import type { ScrubSession } from "./types.js";

/** Placeholder prefixes. Unknown entity types use a sanitized label. */
export const TOKEN_PREFIX: Readonly<Record<string, string>> = {
  PERSON: "PERSON",
  EMAIL_ADDRESS: "EMAIL",
  PHONE_NUMBER: "PHONE",
  US_SSN: "SSN",
  CREDIT_CARD: "CREDIT_CARD",
  IBAN_CODE: "IBAN",
  IP_ADDRESS: "IP",
  URL: "URL",
  DATE_OF_BIRTH: "DOB",
  US_ADDRESS: "ADDRESS",
  US_DRIVER_LICENSE: "DL",
  US_PASSPORT: "PASSPORT",
  CASE_NUMBER: "CASE",
  DOCKET_NUMBER: "DOCKET",
  BATES_NUMBER: "BATES",
  MATTER_NUMBER: "MATTER",
};

export function prefixFor(entityType: string): string {
  const known = TOKEN_PREFIX[entityType];
  if (known) return known;
  const cleaned = entityType
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return cleaned || "ENTITY";
}

/** Identity key: trim, collapse whitespace, ignore case. */
export function canonicalValue(surface: string): string {
  return surface.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createSession(): ScrubSession {
  const byValue = new Map<string, { placeholder: string; surface: string }>();
  const counts = new Map<string, number>();

  return {
    tokenFor(entityType: string, surface: string): string {
      const key = canonicalValue(surface);
      const existing = byValue.get(key);
      if (existing) return existing.placeholder;
      const prefix = prefixFor(entityType);
      const next = (counts.get(prefix) ?? 0) + 1;
      counts.set(prefix, next);
      const placeholder = `[${prefix}_${next}]`;
      byValue.set(key, { placeholder, surface });
      return placeholder;
    },
    mapping(): Record<string, string> {
      const out: Record<string, string> = {};
      for (const entry of byValue.values()) out[entry.placeholder] = entry.surface;
      return out;
    },
  };
}
