import { KINDS } from "./review.js";
import { APP_VERSION } from "./version.js";

export interface ReceiptFinding {
  entityType: string;
  placeholder: string;
  text: string;
}

export interface ReceiptPlaceholder {
  placeholder: string;
  value?: string;
}

export interface RedactionReceipt {
  app: "isolated-sources";
  version: string;
  createdAt: string;
  kinds: { kind: string; count: number }[];
  placeholders: ReceiptPlaceholder[];
  includesOriginalValues: boolean;
  /** SHA-256 of the scrubbed text, not of the original values. */
  scrubbedTextSha256: string;
}

const SCRUBBED_NOTE =
  "SHA-256 of the scrubbed text. You can stamp the receipt file with LightDrawer (https://lightdrawer.org). This page does not send it anywhere.";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function kindLabel(kind: string): string {
  return KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export async function buildReceipt(input: {
  findings: readonly ReceiptFinding[];
  scrubbed: string;
  createdAt: string;
  includeValues: boolean;
  version?: string;
}): Promise<RedactionReceipt> {
  const counts = new Map<string, number>();
  for (const finding of input.findings) {
    const kind = finding.entityType || "UNKNOWN";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const kinds = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => a.kind.localeCompare(b.kind));

  const byPlaceholder = new Map<string, string>();
  for (const finding of input.findings) {
    if (!byPlaceholder.has(finding.placeholder)) byPlaceholder.set(finding.placeholder, finding.text);
  }
  const placeholders: ReceiptPlaceholder[] = [...byPlaceholder.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((placeholder) => {
      const entry: ReceiptPlaceholder = { placeholder };
      if (input.includeValues) entry.value = byPlaceholder.get(placeholder);
      return entry;
    });

  return {
    app: "isolated-sources",
    version: input.version ?? APP_VERSION,
    createdAt: input.createdAt,
    kinds,
    placeholders,
    includesOriginalValues: input.includeValues,
    scrubbedTextSha256: await sha256Hex(utf8(input.scrubbed)),
  };
}

export function receiptText(receipt: RedactionReceipt): string {
  const lines = [
    "Isolated Sources redaction receipt",
    `Version: ${receipt.version}`,
    `Created: ${receipt.createdAt}`,
    "",
    "Replaced",
  ];
  if (receipt.kinds.length === 0) lines.push("Nothing was replaced.");
  for (const kind of receipt.kinds) {
    lines.push(`- ${kindLabel(kind.kind)} (${kind.kind}): ${kind.count}`);
  }
  lines.push("", "Placeholders");
  if (receipt.placeholders.length === 0) lines.push("No placeholders.");
  for (const item of receipt.placeholders) {
    const value = receipt.includesOriginalValues && item.value !== undefined ? `  value: ${item.value}` : "";
    lines.push(`- ${item.placeholder}${value}`);
  }
  lines.push(
    "",
    receipt.includesOriginalValues
      ? "Original values are included in this file. Do not share it unless you mean to."
      : "Original values are not included.",
    "",
    "SHA-256 of the scrubbed text",
    SCRUBBED_NOTE,
    receipt.scrubbedTextSha256,
    "",
    "You must review before you rely on this receipt.",
    "",
  );
  return lines.join("\n");
}

export async function receiptArchive(receipt: RedactionReceipt): Promise<Uint8Array> {
  const { zip } = await import("./metadata/zip.js");
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  return zip([
    { name: "receipt.json", data: utf8(json) },
    { name: "receipt.txt", data: utf8(receiptText(receipt)) },
  ]);
}
