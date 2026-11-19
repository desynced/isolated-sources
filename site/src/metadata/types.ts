export interface MetadataFact {
  label: string;
  value: string;
}

export interface StripResult {
  found: MetadataFact[];
  notes: string[];
  cleaned: Uint8Array;
  downloadName: string;
  mediaType: string;
}

export function cleanedName(name: string): string {
  const base = name.replace(/[/\\]/g, "").replace(/^\.+/, "").trim() || "file";
  return base.toLowerCase().startsWith("cleaned-") ? base : `cleaned-${base}`;
}

export const REVIEW_NOTE = "You must review the cleaned file before you share it.";
