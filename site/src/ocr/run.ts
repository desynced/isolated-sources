import tesseract from "tesseract.js/dist/tesseract.esm.min.js";
import { jpegImages } from "./pdf-images.js";

type OcrWorker = Awaited<ReturnType<typeof tesseract.createWorker>>;

let workerPromise: Promise<OcrWorker> | null = null;

/** Load the bundled engine. Call this only after the person asks. */
export function loadOcr(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = tesseract.createWorker("eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/tesseract-core-lstm.wasm.js",
      langPath: "/ocr",
      gzip: true,
      workerBlobURL: false,
      cacheMethod: "none",
    });
  }
  return workerPromise;
}

export async function readFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const worker = await loadOcr();
  const images: Blob[] = [];
  if (file.name.toLowerCase().endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50)) {
    const jpegs = await jpegImages(bytes);
    if (jpegs.length === 0) {
      return "No embedded JPEG was found in this PDF. This page does not render the page. Export a page as a JPEG or PNG and try that.";
    }
    for (const jpeg of jpegs) {
      const copy = new ArrayBuffer(jpeg.byteLength);
      new Uint8Array(copy).set(jpeg);
      images.push(new Blob([copy], { type: "image/jpeg" }));
    }
  } else {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    images.push(new Blob([copy], { type: file.type || "application/octet-stream" }));
  }
  const parts: string[] = [];
  for (const image of images) {
    const recognized = await worker.recognize(image);
    parts.push(recognized.data.text.trim());
  }
  const text = parts.filter((part) => part.length > 0).join("\n\n");
  return text || "No text was read.";
}
