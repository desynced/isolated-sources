import type { HiddenReport } from "./hidden/types.js";

function required<T extends HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!(el instanceof HTMLElement)) throw new Error(`Missing #${id}`);
  return el as T;
}

export function mountHidden(doc: Document): void {
  const status = required<HTMLElement>(doc, "status");
  const input = required<HTMLInputElement>(doc, "hidden-file");
  const error = required<HTMLElement>(doc, "hidden-error");
  const result = required<HTMLElement>(doc, "hidden-result");
  const found = required<HTMLElement>(doc, "hidden-found");
  const empty = required<HTMLElement>(doc, "hidden-empty");
  const notes = required<HTMLElement>(doc, "hidden-notes");
  const heading = required<HTMLElement>(doc, "hidden-found-heading");

  const reset = (): void => {
    input.value = "";
    error.textContent = "";
    found.replaceChildren();
    notes.replaceChildren();
    result.hidden = true;
  };

  const show = (report: HiddenReport): void => {
    error.textContent = "";
    found.replaceChildren();
    for (const warning of report.warnings) {
      const item = doc.createElement("li");
      item.textContent = warning.detail;
      found.append(item);
    }
    empty.hidden = report.warnings.length !== 0;
    found.hidden = report.warnings.length === 0;
    notes.replaceChildren();
    for (const note of report.notes) {
      const item = doc.createElement("li");
      item.textContent = note;
      notes.append(item);
    }
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
      input.disabled = true;
      status.textContent = "Checking for hidden content. The file stays in this browser.";
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { checkHidden } = await import("./hidden/check.js");
        const report = await checkHidden(bytes);
        show(report);
        const count = report.warnings.length;
        status.textContent =
          count === 0
            ? "No hidden content of those kinds was found. This check can still miss things."
            : `Found ${count} hidden-content warning${count === 1 ? "" : "s"}. The file was not changed.`;
      } catch (caught) {
        result.hidden = true;
        error.textContent = caught instanceof Error ? caught.message : "The file could not be checked.";
        error.focus();
        status.textContent = "The file was not changed.";
      } finally {
        input.disabled = false;
      }
    })();
  });

  doc.getElementById("clear-session")?.addEventListener("click", () => {
    reset();
  });
}
