import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { originalPieces } from "../src/compare.js";

describe("compare pieces", () => {
  it("lines up every replacement with its placeholder", () => {
    const source = "Email Alex Rivera at a@example.com today.";
    const pieces = originalPieces(source, [
      { start: 6, end: 17, text: "Alex Rivera", placeholder: "[PERSON_1]" },
      { start: 21, end: 34, text: "a@example.com", placeholder: "[EMAIL_1]" },
    ]);
    expect(pieces.map((piece) => piece.kind)).toEqual(["text", "hit", "text", "hit", "text"]);
    expect(pieces.filter((piece) => piece.kind === "hit").map((piece) => piece.placeholder)).toEqual([
      "[PERSON_1]",
      "[EMAIL_1]",
    ]);
    expect(pieces.map((piece) => piece.text).join("")).toBe(source);
  });

  it("stacks the compare columns until the wide breakpoint", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const base = /\.compare\s*\{[^}]*grid-template-columns:\s*1fr;/s.exec(css)?.[0] ?? "";
    expect(base).toContain("grid-template-columns: 1fr");
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.view-toggle button[\s\S]*width:\s*100%/);
  });
});
