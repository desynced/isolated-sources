import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HEADER_CSP, META_CSP, headersDocument, injectCsp, page404 } from "../src/csp.js";
import { applyHeaders } from "../src/headers-match.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

const HEADINGS = [
  "How Isolated Sources handles your information",
  "When you clear or close",
  "What stays with you",
  "Our host",
  "Optional OCR",
  "Bookmarklet",
  "Always review",
];

const PARAGRAPHS = [
  "Isolated Sources does not collect or keep your text or files. There are no accounts, cookies, analytics or saved data. Everything you paste, upload or select is processed in your browser tab and is never sent to us.",
  "Clear session wipes your text, files, results and placeholder map from the tab. Closing the tab does the same, because nothing is ever saved to your browser's storage. Once it's cleared or closed, it's gone.",
  "Anything you copied stays on your clipboard, and any receipt or cleaned file you downloaded stays on your computer. The Back button or a browser restoring tabs after a crash can bring back what was on the page. Browser extensions can see what's on screen.",
  "The site runs on Cloudflare. Like any website host, Cloudflare sees ordinary connection details such as your IP address and the page you load, but never your text or files.",
  "If you turn on OCR, about 7 MB of OCR files download from isolatedsources.com. Your file is read in your browser and never sent.",
  "The bookmarklet passes your selection straight to an Isolated Sources tab inside your browser. The text never goes into a URL and is never uploaded.",
  "Check scrubbed text and cleaned files before you rely on them. This page explains how the site works. It is not a legal privacy policy.",
];

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function footer(html: string): string | undefined {
  return /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(html)?.[0];
}

describe("privacy page", () => {
  it("uses the given headings and paragraphs and does not name a code host", () => {
    const html = read("privacy.html");
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect([...main.matchAll(/<h[12]>([^<]*)<\/h[12]>/g)].map((match) => match[1])).toEqual(HEADINGS);
    expect([...main.matchAll(/<p>([^<]*)<\/p>/g)].map((match) => match[1])).toEqual(PARAGRAPHS);
    expect(html).toContain("<title>How Isolated Sources handles your information — Isolated Sources</title>");
    expect(html).toContain(
      'name="description" content="Isolated Sources does not collect or keep your text or files. Everything you paste, upload or select is processed in your browser tab and is never sent to us."',
    );
    expect(html).toContain('<link rel="canonical" href="https://isolatedsources.com/privacy">');
    expect(html).toContain('href="/src/styles.css"');
    expect(html).not.toMatch(/<script\b/i);
    expect(html.toLowerCase()).not.toContain("github");
    expect(html.toLowerCase()).not.toContain("presidio");
    expect(html.toLowerCase()).not.toMatch(/\bcompliant\b|\bhipaa\b|\bcertified\b/);
    expect(main).not.toContain("<a ");

    const built = injectCsp(html);
    expect(built.match(/Content-Security-Policy/g)).toHaveLength(1);
    expect(built).toContain(META_CSP);
    expect(built).not.toContain("wasm-unsafe-eval");
    expect(built).not.toContain("connect-src 'self'");
  });

  it("links Privacy from every site footer", () => {
    for (const name of ["index.html", "ocr.html", "bookmarklet.html", "privacy.html"]) {
      const foot = footer(read(name));
      expect(foot, name).toBeTruthy();
      expect(foot, name).toContain('href="/privacy"');
      expect(foot, name).toContain(">Privacy</a>");
    }
    const missing = footer(page404());
    expect(missing).toBeTruthy();
    expect(missing).toContain('href="/privacy"');
    expect(missing).toContain(">Privacy</a>");
    expect(missing?.toLowerCase()).not.toContain("github");
    expect(missing?.toLowerCase()).not.toContain("presidio");

    const scrub = read("scrub-selection.html");
    const scrubFooter = footer(scrub);
    if (scrubFooter) {
      expect(scrubFooter).toContain('href="/privacy"');
      expect(scrubFooter).toContain(">Privacy</a>");
    } else {
      expect(scrub).not.toContain('class="site-footer"');
    }
  });

  it("is built, listed in the sitemap, and gets the main policy once", () => {
    const sitemap = read("public/sitemap.xml");
    expect(sitemap).toContain("<loc>https://isolatedsources.com/privacy</loc>");
    expect(read("vite.config.ts")).toContain('join(root, "privacy.html")');

    const headers = headersDocument();
    const policies = headers.split("\n").filter((line) => /^\s*Content-Security-Policy:/.test(line));
    expect(policies).toHaveLength(3);
    const home = applyHeaders(headers, "/");
    for (const path of ["/privacy", "/privacy/", "/privacy.html"]) {
      const page = applyHeaders(headers, path);
      expect(page.get("content-security-policy")).toEqual([HEADER_CSP]);
      expect(page.get("content-security-policy")).toHaveLength(1);
      expect(page.get("strict-transport-security")).toEqual(home.get("strict-transport-security"));
      expect(page.get("x-frame-options")).toEqual(["DENY"]);
      expect(page.get("referrer-policy")).toEqual(["no-referrer"]);
      expect(page.get("cross-origin-opener-policy")).toEqual(["same-origin"]);
      expect(page.get("cross-origin-resource-policy")).toEqual(["same-origin"]);
    }

    const files = [
      "node_modules/tesseract.js/dist/worker.min.js",
      "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
      "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    ];
    const total = files.reduce((sum, path) => sum + statSync(join(root, path)).size, 0);
    expect(total).toBeGreaterThan(6_500_000);
    expect(total).toBeLessThan(7_500_000);
    expect(read("privacy.html")).toContain("about 7 MB");
  });
});
