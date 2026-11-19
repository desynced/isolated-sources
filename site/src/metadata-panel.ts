import type { StripResult } from "./metadata/types.js";

function required<T extends HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!(el instanceof HTMLElement)) throw new Error(`Missing #${id}`);
  return el as T;
}

function saveBytes(doc: Document, bytes: Uint8Array, name: string, type: string): void {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function mountMetadata(doc: Document): void {
  const status = required<HTMLElement>(doc, "status");
  const input = required<HTMLInputElement>(doc, "metadata-file");
  const error = required<HTMLElement>(doc, "metadata-error");
  const result = required<HTMLElement>(doc, "metadata-result");
  const found = required<HTMLElement>(doc, "metadata-found");
  const empty = required<HTMLElement>(doc, "metadata-empty");
  const notes = required<HTMLElement>(doc, "metadata-notes");
  const download = required<HTMLButtonElement>(doc, "metadata-download");
  const heading = required<HTMLElement>(doc, "metadata-found-heading");

  let cleaned: StripResult | null = null;

  const reset = (): void => {
    cleaned = null;
    input.value = "";
    error.textContent = "";
    found.replaceChildren();
    notes.replaceChildren();
    result.hidden = true;
    download.disabled = false;
  };

  const show = (report: StripResult): void => {
    cleaned = report;
    error.textContent = "";
    found.replaceChildren();
    for (const fact of report.found) {
      const item = doc.createElement("li");
      const label = doc.createElement("span");
      label.className = "fact-label";
      label.textContent = fact.label;
      const value = doc.createElement("span");
      value.className = "fact-value";
      value.textContent = fact.value;
      item.append(label, value);
      found.append(item);
    }
    empty.hidden = report.found.length !== 0;
    found.hidden = report.found.length === 0;
    notes.replaceChildren();
    for (const note of report.notes) {
      const item = doc.createElement("li");
      item.textContent = note;
      notes.append(item);
    }
    download.textContent = `Download ${report.downloadName}`;
    result.hidden = false;
    heading.tabIndex = -1;
    heading.focus();
  };

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      error.textContent = "";
      result.hidden = true;
      download.disabled = true;
      input.disabled = true;
      status.textContent = "Reading file metadata. The file stays in this browser.";
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { stripFile } = await import("./metadata/strip.js");
        const report = await stripFile(file.name, bytes);
        show(report);
        const count = report.found.length;
        status.textContent =
          count === 0
            ? "No metadata of the kinds this check looks for was found. You can still download the cleaned file."
            : `Found ${count} metadata item${count === 1 ? "" : "s"}. Review them, then download the cleaned file.`;
      } catch (caught) {
        cleaned = null;
        result.hidden = true;
        error.textContent = caught instanceof Error ? caught.message : "The file could not be cleaned.";
        error.focus();
        status.textContent = "The file was not changed.";
      } finally {
        input.disabled = false;
        download.disabled = false;
      }
    })();
  });

  download.addEventListener("click", () => {
    if (!cleaned) return;
    saveBytes(doc, cleaned.cleaned, cleaned.downloadName, cleaned.mediaType);
    status.textContent = `Downloaded ${cleaned.downloadName}. You must review it before you share it.`;
  });

  doc.getElementById("clear-session")?.addEventListener("click", () => {
    reset();
  });
}
