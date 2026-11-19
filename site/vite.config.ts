import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { publicNotice } from "./notice-build.ts";
import { headersDocument, injectCsp, page404 } from "./src/csp.ts";

const root = dirname(fileURLToPath(import.meta.url));

function siteHeaders(): Plugin {
  const license = readFileSync(join(root, "..", "LICENSE"), "utf8");
  const notice = publicNotice(readFileSync(join(root, "..", "NOTICE"), "utf8"));
  return {
    name: "isolated-sources-headers",
    apply: "build",
    transformIndexHtml(html) {
      return injectCsp(html);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headersDocument() });
      this.emitFile({ type: "asset", fileName: "404.html", source: page404() });
      this.emitFile({ type: "asset", fileName: "LICENSE", source: license });
      this.emitFile({ type: "asset", fileName: "NOTICE", source: notice });
    },
    renderChunk(code) {
      const next = code.replaceAll("https://github.com/Hopding/pdf-lib", "pdf-lib");
      if (next === code) return null;
      return { code: next, map: null };
    },
  };
}

export default defineConfig({
  root,
  publicDir: "public",
  appType: "mpa",
  plugins: [siteHeaders()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    modulePreload: false,
  },
});
