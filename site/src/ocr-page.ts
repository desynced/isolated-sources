import { OCR_BUTTON_LABEL } from "./ocr/label.js";
import "./styles.css";

const button = document.getElementById("ocr-download");
const status = document.getElementById("ocr-status");
const work = document.getElementById("ocr-work");
const fileInput = document.getElementById("ocr-file");
const output = document.getElementById("ocr-text");
const error = document.getElementById("ocr-error");

if (button) button.textContent = OCR_BUTTON_LABEL;

let ready = false;

button?.addEventListener("click", () => {
  if (!(button instanceof HTMLButtonElement)) return;
  void (async () => {
    button.disabled = true;
    if (status) status.textContent = "Loading the OCR engine and English data from this site.";
    try {
      const { loadOcr } = await import("./ocr/run.js");
      await loadOcr();
      ready = true;
      if (work) work.hidden = false;
      if (status) status.textContent = "OCR is ready. The files came from this site. Choose an image or a PDF.";
    } catch (caught) {
      button.disabled = false;
      if (error) {
        error.textContent = caught instanceof Error ? caught.message : "OCR did not load.";
      }
      if (status) status.textContent = "OCR did not load. Nothing was sent.";
    }
  })();
});

fileInput?.addEventListener("change", () => {
  if (!(fileInput instanceof HTMLInputElement)) return;
  const file = fileInput.files?.[0];
  if (!file || !ready) return;
  void (async () => {
    if (error) error.textContent = "";
    if (status) status.textContent = "Reading the file in this browser.";
    try {
      const { readFile } = await import("./ocr/run.js");
      const text = await readFile(file);
      if (output) output.textContent = text;
      if (status) status.textContent = "Done. You must review the text before you rely on it.";
    } catch (caught) {
      if (error) error.textContent = caught instanceof Error ? caught.message : "The file could not be read.";
      if (status) status.textContent = "The file was not sent.";
    }
  })();
});
