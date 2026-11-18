import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return [path];
  });
}

describe("site privacy boundaries", () => {
  it("does not call the network, store data, or use forbidden claims", () => {
    const paths = [
      ...filesIn(join(root, "site", "src")),
      ...filesIn(join(root, "site", "public")),
      join(root, "site", "index.html"),
      join(root, "site", "vite.config.ts"),
      join(root, "README.md"),
      join(root, "wrangler.jsonc"),
    ];
    const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toMatch(/\blocalStorage\b/);
    expect(source).not.toMatch(/\bsessionStorage\b/);
    expect(source).not.toMatch(/\bindexedDB\b/);
    expect(source).not.toMatch(/\bdocument\.cookie\b/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/\bWebSocket\b/);
    expect(source).not.toMatch(/\bsendBeacon\b/);
    expect(source).not.toMatch(/googleapis|google-analytics|googletagmanager|cloudflareinsights|plausible|posthog/i);
    for (const word of ["compliant", "certified", "hipaa-safe", "de-identified", "secure-guaranteed"]) {
      expect(source.toLowerCase()).not.toContain(word);
    }

    const config = readFileSync(join(root, "site", "src", "config.ts"), "utf8");
    expect(config).toMatch(/PAYPAL_ME_URL\s*=\s*"https:\/\/paypal\.me\/josephball"/);

    const wrangler = readFileSync(join(root, "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain('"./site/dist"');
    expect(wrangler).not.toMatch(/"main"\s*:/);
  });
});
