import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PatternRecognizer,
  type NameModel,
  type PatternDef,
  createSession,
  rescan,
  scrub,
} from "../src/index.js";

describe("placeholders, sessions, plug-ins, and the fail-safe", () => {
  it("reuses a token for the same value and keeps a session across calls", async () => {
    const session = createSession();
    const first = await scrub("Email A@example.com twice: A@example.com.", { session });
    expect(first.findings).toHaveLength(2);
    expect(new Set(first.findings.map((item) => item.placeholder))).toEqual(new Set(["[EMAIL_1]"]));
    expect(first.text.match(/\[EMAIL_1\]/g)).toHaveLength(2);
    expect(first.mapping["[EMAIL_1]"]).toBe("A@example.com");

    const second = await scrub("Later a@example.com and b@example.com.", { session });
    expect(second.text).toContain("[EMAIL_1]");
    expect(second.text).toContain("[EMAIL_2]");
    expect(second.mapping["[EMAIL_1]"]).toBe("A@example.com");
    expect(second.mapping["[EMAIL_2]"]).toBe("b@example.com");
  });

  it("runs a caller-supplied name model and an extra recognizer", async () => {
    const model: NameModel = {
      id: "toy-ner",
      async detect(text: string) {
        const needle = "Pat Exampleton";
        const start = text.indexOf(needle);
        return start < 0 ? [] : [{ start, end: start + needle.length, score: 0.92 }];
      },
    };
    class BadgeRecognizer extends PatternRecognizer {
      readonly id = "badge";
      readonly entityType = "BADGE";
      readonly patterns: readonly PatternDef[] = [
        { name: "badge", regex: /\bBADGE-\d{4}\b/, score: 0.9 },
      ];
    }

    const { text, findings } = await scrub("Pat Exampleton used BADGE-4410.", {
      nameModel: model,
      extraRecognizers: [new BadgeRecognizer()],
    });
    expect(text).toBe("[PERSON_1] used [BADGE_1].");
    expect(findings.map((item) => item.recognizer)).toEqual(["toy-ner", "badge"]);
    expect(findings[0]?.contextSnippet).toContain("Pat Exampleton");
  });

  it("reports leftovers from the scrubbed text and from a later rescan", async () => {
    const clean = await scrub("Email casey.sample@example.com only.");
    expect(clean.residual).toEqual([]);
    expect(clean.text).not.toContain("example.com");

    const leaked = await rescan(`${clean.text} Also 4155550199.`);
    expect(leaked.some((item) => item.text === "4155550199")).toBe(true);

    const inline = await scrub("Reference 4155550199 in the index.");
    expect(inline.residual.map((item) => item.text)).toContain("4155550199");
    expect(inline.text).toContain("4155550199");
  });

  it("does not call the network from the library source", () => {
    const root = join(import.meta.dirname, "..", "src");
    const files = walk(root);
    expect(files.length).toBeGreaterThan(10);
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/\bWebSocket\b/);
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/from\s+["'](?:fs|net|http|https|child_process)["']/);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}
