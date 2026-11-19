import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptSelection, BOOKMARKLET_CAVEAT, buildBookmarklet } from "../src/bookmarklet.js";

describe("bookmarklet", () => {
  it("states the limit and does not send data", () => {
    const href = buildBookmarklet("https://isolatedsources.com");
    expect(href.startsWith("javascript:")).toBe(true);
    expect(href).toContain(BOOKMARKLET_CAVEAT);
    expect(href).toContain("https://isolatedsources.com/bookmarklet.html#");
    expect(href).not.toMatch(/fetch\s*\(/);
    expect(href).not.toMatch(/\bXMLHttpRequest\b/);
    expect(href).not.toMatch(/\bWebSocket\b/);
    expect(href).not.toMatch(/\bsendBeacon\b/);
    expect(href.toLowerCase()).not.toContain("github.com");
    expect(buildBookmarklet("http://127.0.0.1:4173")).toContain("http://127.0.0.1:4173/bookmarklet.html#");
    expect(() => buildBookmarklet("javascript:alert(1)")).toThrow();
  });

  it("accepts one matching handoff from the opener and nothing else", () => {
    const opener = { id: "opener" };
    const other = { id: "other" };
    expect(acceptSelection(opener, opener, "tok", { isolatedSources: "tok", text: "Ada" })).toEqual({
      ok: true,
      text: "Ada",
    });
    expect(acceptSelection(other, opener, "tok", { isolatedSources: "tok", text: "Ada" }).ok).toBe(false);
    expect(acceptSelection(opener, opener, "tok", { isolatedSources: "nope", text: "Ada" }).ok).toBe(false);
    expect(acceptSelection(opener, opener, "tok", { isolatedSources: "tok", text: "  " }).ok).toBe(false);
    expect(acceptSelection(null, null, "tok", { isolatedSources: "tok", text: "Ada" }).ok).toBe(false);
  });

  it("keeps the same warning on the page", () => {
    const html = readFileSync(new URL("../bookmarklet.html", import.meta.url), "utf8");
    expect(html).toContain(BOOKMARKLET_CAVEAT);
    expect(html.toLowerCase()).not.toContain("github.com");
    expect(html.toLowerCase()).not.toContain("presidio");
  });
});
