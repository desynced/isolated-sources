import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEADER_CSP, META_CSP, OCR_HEADER_CSP, OCR_META_CSP, STRICT_TRANSPORT_SECURITY, headersDocument, injectCsp, page404 } from "../src/csp.js";
import { applyHeaders } from "../src/headers-match.js";

describe("content security policy", () => {
  it("blocks network, inline scripts, and framing on the static build", () => {
    expect(META_CSP).toContain("default-src 'none'");
    expect(META_CSP).toContain("connect-src 'none'");
    expect(META_CSP).toContain("script-src 'self'");
    expect(META_CSP).toContain("style-src 'self'");
    expect(META_CSP).not.toContain("unsafe-inline");
    expect(META_CSP).not.toContain("unsafe-eval");
    expect(META_CSP).not.toContain("wasm-unsafe-eval");
    expect(OCR_META_CSP).toContain("'wasm-unsafe-eval'");
    expect(OCR_META_CSP).toContain("connect-src 'self'");
    expect(OCR_META_CSP).toContain("worker-src 'self'");
    expect(OCR_META_CSP.replaceAll("'wasm-unsafe-eval'", "")).not.toContain("unsafe-eval");
    expect(OCR_META_CSP).not.toContain("unsafe-inline");
    expect(OCR_HEADER_CSP).toContain("frame-ancestors 'none'");
    expect(META_CSP).not.toContain("frame-ancestors");
    expect(META_CSP).not.toContain("upgrade-insecure-requests");
    expect(HEADER_CSP).toContain("frame-ancestors 'none'");
    expect(HEADER_CSP).toContain("upgrade-insecure-requests");

    const headers = headersDocument();
    expect(headers.indexOf("\n/*\n")).toBeLessThan(headers.indexOf("\n/ocr\n"));
    expect(headers.indexOf("\n/ocr\n")).toBeLessThan(headers.indexOf("\n/ocr/*\n"));
    expect(STRICT_TRANSPORT_SECURITY).toBe("max-age=31536000; includeSubDomains");
    expect(headers).toContain(`Strict-Transport-Security: ${STRICT_TRANSPORT_SECURITY}`);
    expect(headers).toContain("! Content-Security-Policy");
    expect(headers).toContain("! Cross-Origin-Opener-Policy");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Referrer-Policy: no-referrer");

    const home = applyHeaders(headers, "/");
    expect(home.get("content-security-policy")).toEqual([HEADER_CSP]);
    expect(home.get("cross-origin-opener-policy")).toEqual(["same-origin"]);

    for (const path of ["/ocr", "/ocr/", "/ocr/worker.min.js"]) {
      const ocr = applyHeaders(headers, path);
      expect(ocr.get("content-security-policy")).toEqual([OCR_HEADER_CSP]);
      expect(ocr.get("cross-origin-opener-policy")).toEqual(["same-origin"]);
    }

    for (const path of ["/bookmarklet", "/bookmarklet.html", "/bookmarklet/"]) {
      const page = applyHeaders(headers, path);
      expect(page.get("content-security-policy")).toEqual([HEADER_CSP]);
      expect(page.get("cross-origin-opener-policy")).toEqual(["unsafe-none"]);
    }

    const scrubRule = headers.slice(headers.indexOf("\n/scrub-selection*\n"));
    expect(scrubRule).toContain("! Cross-Origin-Opener-Policy");
    expect(scrubRule).toContain("Cross-Origin-Opener-Policy: unsafe-none");
    expect(scrubRule).not.toContain("Content-Security-Policy");
    for (const path of ["/scrub-selection", "/scrub-selection.html", "/scrub-selection/"]) {
      const page = applyHeaders(headers, path);
      expect(page.get("content-security-policy")).toEqual([HEADER_CSP]);
      expect(page.get("cross-origin-opener-policy")).toEqual(["unsafe-none"]);
      expect(page.get("cross-origin-resource-policy")).toEqual(["same-origin"]);
    }

    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).not.toContain("Content-Security-Policy");
    const built = injectCsp(html);
    expect(built).toContain(META_CSP);
    expect(injectCsp(built)).toBe(built);

    const missing = page404();
    expect(missing).toContain(META_CSP);
    expect(missing).toContain("This page is not here.");
    expect(missing).toContain('class="site-header"');
    expect(missing).toContain('class="brand"');
    expect(missing).toContain("apple-touch-icon");
    expect(missing).not.toContain("unsafe-inline");
    const css = readFileSync(new URL("../public/404.css", import.meta.url), "utf8");
    expect(css).toMatch(/font-family:\s*Georgia/);
  });
});
