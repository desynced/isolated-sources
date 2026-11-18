import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { headersDocument, injectCsp, page404 } from "./src/csp.ts";

const root = dirname(fileURLToPath(import.meta.url));

function siteHeaders(): Plugin {
  return {
    name: "isolated-sources-headers",
    apply: "build",
    transformIndexHtml(html) {
      return injectCsp(html);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headersDocument() });
      this.emitFile({ type: "asset", fileName: "404.html", source: page404() });
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
  },
});
