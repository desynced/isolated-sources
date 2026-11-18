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

export function injectCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${META_CSP}">`;
  if (html.includes('http-equiv="Content-Security-Policy"')) return html;
  return html.replace("</head>", `    ${meta}\n  </head>`);
}

export function headersDocument(): string {
  return [
    "/*",
    `  Content-Security-Policy: ${HEADER_CSP}`,
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
  ].join("\n");
}

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
  <link rel="stylesheet" href="/404.css">
</head>
<body>
  <main class="wrap">
    <h1>This page is not here.</h1>
    <p><a href="/">Back to Isolated Sources</a></p>
  </main>
</body>
</html>
`;
}
