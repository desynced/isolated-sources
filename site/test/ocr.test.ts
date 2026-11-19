import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { OCR_BUTTON_LABEL } from "../src/ocr/label.js";
import { jpegImages } from "../src/ocr/pdf-images.js";

const repo = fileURLToPath(new URL("../..", import.meta.url));

const OCR_FILES = [
  "node_modules/tesseract.js/dist/worker.min.js",
  "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
];

describe("optional OCR", () => {
  it("labels a download that matches the bundled engine size", () => {
    const total = OCR_FILES.reduce((sum, path) => sum + statSync(join(repo, path)).size, 0);
    expect(total).toBeGreaterThan(6_500_000);
    expect(total).toBeLessThan(7_500_000);
    expect(OCR_BUTTON_LABEL).toBe("Download OCR (about 7 MB)");
  });

  it("stays off the main page until the separate page asks for it", () => {
    const main = readFileSync(join(repo, "site/src/main.ts"), "utf8");
    const page = readFileSync(join(repo, "site/src/ocr-page.ts"), "utf8");
    const html = readFileSync(join(repo, "site/ocr.html"), "utf8");
    const index = readFileSync(join(repo, "site/index.html"), "utf8");
    expect(main).not.toContain("ocr/run");
    expect(page).toContain('import("./ocr/run.js")');
    expect(page).not.toMatch(/\bfetch\s*\(/);
    expect(html).toContain("isolatedsources.com");
    expect(html).toContain("airplane-mode self-test");
    expect(html.toLowerCase()).not.toContain("github.com");
    expect(html.toLowerCase()).not.toContain("jsdelivr");
    expect(index).toContain("/ocr.html");
    expect(index).toContain("airplane-mode self-test");
  });

  it("pulls an embedded JPEG out of a PDF and does not invent page text", async () => {
    const raw = Buffer.from(
      "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda00080001000100003f00fbffd9",
      "hex",
    );
    const jpeg = new Uint8Array(raw.byteLength);
    jpeg.set(raw);
    const doc = await PDFDocument.create();
    const image = await doc.embedJpg(jpeg);
    const page = doc.addPage([100, 100]);
    page.drawImage(image, { x: 10, y: 10, width: 20, height: 20 });
    const saved = new Uint8Array(await doc.save({ useObjectStreams: false }));
    const images = await jpegImages(saved);
    expect(images.length).toBe(1);
    expect(images[0][0]).toBe(0xff);
    expect(images[0][1]).toBe(0xd8);
  });
});
