import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unzip } from "../src/metadata/zip.js";
import { buildReceipt, receiptArchive, receiptText, sha256Hex } from "../src/receipt.js";
import { APP_VERSION } from "../src/version.js";

describe("redaction receipt", () => {
  it("matches the package version and a known SHA-256", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Hex(bytes)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("leaves out original values and hashes of them unless asked", async () => {
    const findings = [
      { entityType: "PERSON", placeholder: "[PERSON_1]", text: "Ada Lovelace" },
      { entityType: "EMAIL_ADDRESS", placeholder: "[EMAIL_1]", text: "ada@example.com" },
      { entityType: "EMAIL_ADDRESS", placeholder: "[EMAIL_1]", text: "ada@example.com" },
    ];
    const receipt = await buildReceipt({
      findings,
      scrubbed: "Hello [PERSON_1]",
      createdAt: "2026-11-19T00:00:00.000Z",
      includeValues: false,
    });
    expect(receipt.version).toBe(APP_VERSION);
    expect(receipt.kinds).toEqual([
      { kind: "EMAIL_ADDRESS", count: 2 },
      { kind: "PERSON", count: 1 },
    ]);
    expect(receipt.placeholders).toEqual([{ placeholder: "[EMAIL_1]" }, { placeholder: "[PERSON_1]" }]);
    expect(receipt.scrubbedTextSha256).toBe(await sha256Hex(new TextEncoder().encode("Hello [PERSON_1]")));
    expect(JSON.stringify(receipt)).not.toMatch(/valueSha256|mapSha256|lightdrawerFingerprint/i);
    const packed = JSON.stringify(receipt) + receiptText(receipt);
    expect(packed).not.toContain("Ada Lovelace");
    expect(packed).not.toContain("ada@example.com");
    expect(receiptText(receipt)).toContain("SHA-256 of the scrubbed text");
    expect(receiptText(receipt)).toContain("You can stamp the receipt file with LightDrawer");
    expect(receiptText(receipt)).toMatch(/you must review/i);

    const opted = await buildReceipt({
      findings,
      scrubbed: "Hello [PERSON_1]",
      createdAt: "2026-11-19T00:00:00.000Z",
      includeValues: true,
    });
    expect(opted.placeholders.find((item) => item.placeholder === "[PERSON_1]")?.value).toBe("Ada Lovelace");
    expect(receiptText(opted)).toContain("Ada Lovelace");
    expect(receiptText(opted)).toMatch(/do not share/i);

    const archive = await receiptArchive(receipt);
    const entries = await unzip(archive);
    const json = new TextDecoder().decode(entries.find((entry) => entry.name === "receipt.json")?.data);
    expect(json).not.toContain("Ada Lovelace");
    expect(json).toContain(receipt.scrubbedTextSha256);
  });
});
