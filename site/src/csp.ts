/**
 * Production Content-Security-Policy.
 * The meta tag omits frame-ancestors (browsers ignore it there) and
 * upgrade-insecure-requests (it would break a local http preview).
 * The _headers file used by Workers static assets carries both.
 */

const SHARED = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "media-src 'none'",
] as const;

export const META_CSP = SHARED.join("; ");

export const HEADER_CSP = [...SHARED, "frame-ancestors 'none'", "upgrade-insecure-requests"].join("; ");

/** One year, including subdomains. Browsers honor this only on HTTPS responses. */
export const STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains";

/**
 * OCR page only. Wasm compilation needs wasm-unsafe-eval, and the worker
 * reads the engine files from this origin. The main page does not use this.
 */
const OCR_SHARED = SHARED.map((part) => {
  if (part === "script-src 'self'") return "script-src 'self' 'wasm-unsafe-eval'";
  if (part === "connect-src 'none'") return "connect-src 'self'";
  if (part === "worker-src 'none'") return "worker-src 'self'";
  return part;
});

export const OCR_META_CSP = OCR_SHARED.join("; ");

export const OCR_HEADER_CSP = [...OCR_SHARED, "frame-ancestors 'none'", "upgrade-insecure-requests"].join("; ");

export function injectCsp(html: string, policy = META_CSP): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  if (html.includes('http-equiv="Content-Security-Policy"')) return html;
  return html.replace("</head>", `    ${meta}\n  </head>`);
}

/**
 * `/*` is first. Cloudflare keeps every Content-Security-Policy header that
 * matches, so a later rule has to detach the strict policy with
 * `! Content-Security-Policy` before it sets the OCR policy. html_handling
 * auto-trailing-slash answers `/ocr.html` with a 307 to `/ocr`, so the OCR
 * rules are `/ocr` and `/ocr/*`, not only `/ocr.html`. `/bookmarklet*` and
 * `/scrub-selection*` drop Cross-Origin-Opener-Policy and set unsafe-none
 * so a cross-origin bookmarklet tab can still see window.opener. They do
 * not set Content-Security-Policy again: Cloudflare keeps every matching
 * policy, and `/*` already set the strict one.
 */
export function headersDocument(): string {
  return [
    "/*",
    `  Content-Security-Policy: ${HEADER_CSP}`,
    `  Strict-Transport-Security: ${STRICT_TRANSPORT_SECURITY}`,
    "  X-Frame-Options: DENY",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: no-referrer",
    "  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",
    "  Cross-Origin-Opener-Policy: same-origin",
    "  Cross-Origin-Resource-Policy: same-origin",
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/ocr",
    "  ! Content-Security-Policy",
    `  Content-Security-Policy: ${OCR_HEADER_CSP}`,
    "",
    "/ocr/*",
    "  ! Content-Security-Policy",
    `  Content-Security-Policy: ${OCR_HEADER_CSP}`,
    "",
    "/bookmarklet*",
    "  ! Cross-Origin-Opener-Policy",
    "  Cross-Origin-Opener-Policy: unsafe-none",
    "",
    "/scrub-selection*",
    "  ! Cross-Origin-Opener-Policy",
    "  Cross-Origin-Opener-Policy: unsafe-none",
    "",
  ].join("\n");
}

const MARK = `<svg class="mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0e3b38"/>
          <rect x="8" y="6" width="16" height="20" rx="2" fill="#f7f4ee"/>
          <rect x="11" y="10" width="10" height="2" fill="#0e3b38"/>
          <rect x="11" y="15" width="7" height="2" fill="#c9a227"/>
          <rect x="11" y="20" width="10" height="2" fill="#0e3b38"/>
        </svg>`;

export function page404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page not found — Isolated Sources</title>
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${META_CSP}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/404.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap bar">
      <p class="brand">
        ${MARK}
        <span>Isolated Sources</span>
      </p>
    </div>
  </header>
  <main id="main" class="wrap">
    <h1>This page is not here.</h1>
    <p><a href="/">Back to Isolated Sources</a></p>
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <p class="memory-note">The mapping is held in memory for this tab. Clear session drops it.</p>
      <ul class="footer-links">
        <li>Open source, MIT.</li>
        <li><a href="/LICENSE">MIT License</a></li>
        <li><a href="/NOTICE">License notices</a></li>
        <li><a href="/privacy">Privacy</a></li>
      </ul>
    </div>
  </footer>
</body>
</html>
`;
}
