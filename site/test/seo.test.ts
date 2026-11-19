import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGE_DESCRIPTION, PAGE_TITLE } from "../src/meta.js";

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("search and icons", () => {
  it("ships a title, description, canonical link, and social tags", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain(`<title>${PAGE_TITLE}</title>`);
    expect(html).toContain(`content="${PAGE_DESCRIPTION}"`);
    expect(PAGE_DESCRIPTION).toContain("legal patterns");
    expect(PAGE_DESCRIPTION).toContain("exact restore");
    expect(html).toContain('<link rel="canonical" href="https://isolatedsources.com/">');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:image" content="https://isolatedsources.com/og.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/favicon-32.png"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).not.toMatch(/\bPII\b/);
  });

  it("publishes robots.txt and a sitemap", () => {
    const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Content-Signal: search=yes, ai-input=no, ai-train=no");
    expect(robots).toContain("Sitemap: https://isolatedsources.com/sitemap.xml");
    const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
    expect(sitemap).toContain("<loc>https://isolatedsources.com/</loc>");
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it("includes a social image and icon fallbacks", () => {
    expect(pngSize(readFileSync(new URL("../public/og.png", import.meta.url)))).toEqual({
      width: 1200,
      height: 630,
    });
    expect(pngSize(readFileSync(new URL("../public/favicon-32.png", import.meta.url)))).toEqual({
      width: 32,
      height: 32,
    });
    expect(pngSize(readFileSync(new URL("../public/apple-touch-icon.png", import.meta.url)))).toEqual({
      width: 180,
      height: 180,
    });
    const ico = readFileSync(new URL("../public/favicon.ico", import.meta.url));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
  });
});