import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEADER_CSP, META_CSP, STRICT_TRANSPORT_SECURITY, headersDocument, injectCsp, page404 } from "../src/csp.js";

describe("content security policy", () => {
  it("blocks network, inline scripts, and framing on the static build", () => {
    expect(META_CSP).toContain("default-src 'none'");
    expect(META_CSP).toContain("connect-src 'none'");
    expect(META_CSP).toContain("script-src 'self'");
    expect(META_CSP).toContain("style-src 'self'");
    expect(META_CSP).not.toContain("unsafe-inline");
    expect(META_CSP).not.toContain("unsafe-eval");
    expect(META_CSP).not.toContain("frame-ancestors");
    expect(META_CSP).not.toContain("upgrade-insecure-requests");
    expect(HEADER_CSP).toContain("frame-ancestors 'none'");
    expect(HEADER_CSP).toContain("upgrade-insecure-requests");

    const headers = headersDocument();
    expect(headers).toContain(HEADER_CSP);
    expect(STRICT_TRANSPORT_SECURITY).toBe("max-age=31536000; includeSubDomains");
    expect(headers).toContain(`Strict-Transport-Security: ${STRICT_TRANSPORT_SECURITY}`);
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Referrer-Policy: no-referrer");

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
