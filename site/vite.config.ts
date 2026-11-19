import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { publicNotice } from "./notice-build.ts";
import { headersDocument, injectCsp, OCR_META_CSP, page404 } from "./src/csp.ts";

const root = dirname(fileURLToPath(import.meta.url));

function assetBytes(path: string, rewriteCdn: boolean): Uint8Array {
  const bytes = readFileSync(path);
  if (!rewriteCdn) return bytes;
  const text = bytes.toString("utf8").replaceAll("https://cdn.jsdelivr.net/npm/", "/ocr/blocked/");
  return new TextEncoder().encode(text);
}

function siteHeaders(): Plugin {
  const repo = join(root, "..");
  const license = readFileSync(join(repo, "LICENSE"), "utf8");
  const apache = readFileSync(join(repo, "node_modules/tesseract.js/LICENSE.md"), "utf8");
  const notice = publicNotice(
    readFileSync(join(repo, "NOTICE"), "utf8"),
    [
      "tesseract.js and tesseract.js-core are licensed under the Apache License, Version 2.0.",
      "The English traineddata is the Tesseract eng model.",
      "",
      apache.trim(),
    ].join("\n"),
  );
  const ocrAssets: [string, string, boolean][] = [
    ["node_modules/tesseract.js/dist/worker.min.js", "ocr/worker.min.js", true],
    ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "ocr/tesseract-core-lstm.wasm.js", false],
    ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "ocr/eng.traineddata.gz", false],
  ];
  return {
    name: "isolated-sources-headers",
    apply: "build",
    transformIndexHtml(html, ctx) {
      if (ctx.path === "/ocr.html") return injectCsp(html, OCR_META_CSP);
      return injectCsp(html);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headersDocument() });
      this.emitFile({ type: "asset", fileName: "404.html", source: page404() });
      this.emitFile({ type: "asset", fileName: "LICENSE", source: license });
      this.emitFile({ type: "asset", fileName: "NOTICE", source: notice });
      for (const [from, to, rewrite] of ocrAssets) {
        this.emitFile({ type: "asset", fileName: to, source: assetBytes(join(repo, from), rewrite) });
      }
    },
    renderChunk(code) {
      const next = code
        .replaceAll("https://github.com/Hopding/pdf-lib", "pdf-lib")
        .replaceAll("https://cdn.jsdelivr.net/npm/", "/ocr/blocked/");
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
    rollupOptions: {
      input: {
        main: join(root, "index.html"),
        bookmarklet: join(root, "bookmarklet.html"),
        ocr: join(root, "ocr.html"),
      },
    },
  },
});
