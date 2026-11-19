import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptSelection, BOOKMARKLET_CAVEAT, bookmarkletResultOnly, buildBookmarklet, selectionStatus } from "../src/bookmarklet.js";

describe("bookmarklet", () => {
  it("opens the extensionless result page and does not send data", () => {
    const href = buildBookmarklet("https://isolatedsources.com");
    expect(href.startsWith("javascript:")).toBe(true);
    expect(href).toContain(BOOKMARKLET_CAVEAT);
    expect(href).toContain('"https://isolatedsources.com/scrub-selection#"+token');
    expect(href).not.toContain("scrub-selection.html");
    expect(href).not.toContain("bookmarklet.html");
    expect(href).not.toContain("/bookmarklet#");
    expect(href).not.toMatch(/fetch\s*\(/);
    expect(href).not.toMatch(/\bXMLHttpRequest\b/);
    expect(href).not.toMatch(/\bWebSocket\b/);
    expect(href).not.toMatch(/\bsendBeacon\b/);
    expect(href.toLowerCase()).not.toContain("github.com");
    expect(buildBookmarklet("http://127.0.0.1:4173")).toContain('"http://127.0.0.1:4173/scrub-selection#"+token');
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

  it("keeps the install page for a plain visit and the result for a saved hash", () => {
    expect(bookmarkletResultOnly("")).toBe(false);
    expect(bookmarkletResultOnly("#")).toBe(false);
    expect(bookmarkletResultOnly("#tok")).toBe(true);
    expect(selectionStatus(1)).toBe("Scrubbed 1 span. You must review before you share this.");
    expect(selectionStatus(2)).toBe("Scrubbed 2 spans. You must review before you share this.");

    const html = readFileSync(new URL("../bookmarklet.html", import.meta.url), "utf8");
    const page = readFileSync(new URL("../src/bookmarklet-page.ts", import.meta.url), "utf8");
    expect(html).toContain(BOOKMARKLET_CAVEAT);
    expect(html.toLowerCase()).not.toContain("github.com");
    expect(html.toLowerCase()).not.toContain("presidio");
    const install = html.slice(html.indexOf('id="bookmarklet-install"'), html.indexOf('id="bookmarklet-waiting"'));
    expect(install).toContain("Drag the link to your bookmarks bar");
    expect(install).toContain('id="bookmarklet-source"');
    expect(install).not.toContain('id="bookmarklet-result"');
    expect(page).toContain("bookmarkletResultOnly(location.hash)");
    expect(page).toContain("install.hidden = true");
  });

  it("serves a result page with no install copy and keeps it out of the sitemap", () => {
    const html = readFileSync(new URL("../scrub-selection.html", import.meta.url), "utf8");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain("The text was scrubbed in this tab. It was not uploaded.");
    expect(html).toContain("Copy scrubbed text");
    expect(html).toContain("Helps identify and replace common identifiers. You must review before sharing.");
    expect(html).toContain('id="scrub-home" href="/"');
    expect(html).toContain("This page is meant to be opened by the bookmarklet.");
    expect(html).toContain('href="/bookmarklet"');
    expect(html).not.toContain("Drag the link");
    expect(html).not.toContain("Bookmarklet source");
    expect(html).not.toContain("javascript:");
    expect(html.toLowerCase()).not.toContain("github.com");
    expect(html.toLowerCase()).not.toContain("presidio");
    const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
    expect(sitemap).not.toContain("scrub-selection");
    const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(vite).toContain("scrub-selection.html");
  });
});
