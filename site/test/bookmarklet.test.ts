import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptSelection,
  BOOKMARKLET_CAVEAT,
  buildBookmarklet,
  canReceiveSelection,
  installHiddenForHash,
  SCRUB_SELECTION_HASH,
  selectionStatus,
} from "../src/bookmarklet.js";

describe("bookmarklet", () => {
  it("opens the result page without a redirect and does not send data", () => {
    const href = buildBookmarklet("https://isolatedsources.com");
    expect(href.startsWith("javascript:")).toBe(true);
    expect(href).toContain(BOOKMARKLET_CAVEAT);
    expect(href).toContain(`https://isolatedsources.com${SCRUB_SELECTION_HASH}`);
    expect(href).toContain('window.open("https://isolatedsources.com/scrub-selection#"+token)');
    expect(href).not.toContain("bookmarklet.html");
    expect(href).not.toContain("scrub-selection.html");
    expect(href).not.toMatch(/fetch\s*\(/);
    expect(href).not.toMatch(/\bXMLHttpRequest\b/);
    expect(href).not.toMatch(/\bWebSocket\b/);
    expect(href).not.toMatch(/\bsendBeacon\b/);
    expect(href.toLowerCase()).not.toContain("github.com");
    expect(buildBookmarklet("http://127.0.0.1:4173")).toContain(
      'window.open("http://127.0.0.1:4173/scrub-selection#"+token)',
    );
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
    expect(canReceiveSelection("tok", opener)).toBe(true);
    expect(canReceiveSelection("tok", null)).toBe(false);
    expect(canReceiveSelection("", opener)).toBe(false);
    expect(selectionStatus(1)).toBe("Scrubbed 1 span. You must review before you share this.");
    expect(selectionStatus(2)).toBe("Scrubbed 2 spans. You must review before you share this.");
  });

  it("keeps the install page, and hides it when a saved bookmarklet opens a hash", () => {
    expect(installHiddenForHash("")).toBe(false);
    expect(installHiddenForHash("#")).toBe(false);
    expect(installHiddenForHash("#saved-token")).toBe(true);
    const html = readFileSync(new URL("../bookmarklet.html", import.meta.url), "utf8");
    expect(html).toContain(BOOKMARKLET_CAVEAT);
    expect(html).toContain('id="bookmarklet-install"');
    expect(html).toContain("Drag the link to your bookmarks bar.");
    expect(html).toContain("Bookmarklet source");
    expect(html).toContain('id="bookmarklet-result"');
    expect(html.toLowerCase()).not.toContain("github.com");
    expect(html.toLowerCase()).not.toContain("presidio");
    const page = readFileSync(new URL("../src/bookmarklet-page.ts", import.meta.url), "utf8");
    expect(page).toContain("installHiddenForHash");
    expect(page).toContain("bookmarklet-install");
    expect(page).toContain("takeSelection");
  });

  it("serves a result page with no install instructions and no bookmarklet source", () => {
    const html = readFileSync(new URL("../scrub-selection.html", import.meta.url), "utf8");
    const page = readFileSync(new URL("../src/scrub-selection-page.ts", import.meta.url), "utf8");
    const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
    expect(vite).toContain('join(root, "scrub-selection.html")');
    expect(sitemap).not.toContain("scrub-selection");
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('class="site-header"');
    expect(html).toContain("This page is meant to be opened by the bookmarklet.");
    expect(html).toContain('href="/bookmarklet"');
    expect(html).toContain("This text was scrubbed in this tab. It was not uploaded.");
    expect(html).toContain('id="scrub-status"');
    expect(html).toContain('id="scrub-output"');
    expect(html).toContain("Copy scrubbed text");
    expect(html).toContain("Helps identify and replace common identifiers. You must review before sharing.");
    expect(html).toContain('id="scrub-home" href="/"');
    expect(html).toContain("Back to the home page");
    expect(html).not.toContain("Drag the link");
    expect(html).not.toContain("Bookmarklet source");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Content-Security-Policy");
    expect(html.toLowerCase()).not.toContain("github.com");
    expect(html.toLowerCase()).not.toContain("presidio");
    expect(page).toContain("canReceiveSelection");
    expect(page).not.toContain("buildBookmarklet");
    expect(page.toLowerCase()).not.toContain("github.com");
    expect(page.toLowerCase()).not.toContain("presidio");
  });
});
