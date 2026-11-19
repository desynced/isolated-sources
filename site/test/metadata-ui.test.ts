// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../src/app.js";
import { mountMetadata } from "../src/metadata-panel.js";
import { zip } from "../src/metadata/zip.js";

function importPath(): string {
  const href = import.meta.url;
  const marker = "file://";
  if (!href.startsWith(marker)) throw new Error(`Unexpected module URL ${href}`);
  return decodeURIComponent(href.slice(marker.length));
}

function load(): void {
  const html = readFileSync(join(dirname(importPath()), "../index.html"), "utf8");
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? "";
  document.body.innerHTML = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  mount(document);
  mountMetadata(document);
}

async function tinyDocx(): Promise<Uint8Array> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Visible body stays</w:t></w:r></w:p></w:body></w:document>`;
  const core = `<cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:creator>Zelda Quinn</dc:creator></cp:coreProperties>`;
  return zip([
    { name: "word/document.xml", data: new TextEncoder().encode(xml) },
    { name: "docProps/core.xml", data: new TextEncoder().encode(core) },
  ]);
}

describe("metadata panel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows what it found and does not call the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    load();
    const input = document.getElementById("metadata-file");
    if (!(input instanceof HTMLInputElement)) throw new Error("missing file input");
    expect(document.querySelector('label[for="metadata-file"]')).not.toBeNull();
    const bytes = await tinyDocx();
    const file = new File([bytes], "memo.docx");
    Object.defineProperty(input, "files", { configurable: true, value: { 0: file, length: 1, item: () => file } });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
      expect(document.getElementById("metadata-result")?.hasAttribute("hidden")).toBe(false);
    });
    expect(document.getElementById("metadata-found")?.textContent).toContain("Zelda Quinn");
    expect(document.getElementById("metadata-found")?.textContent).toContain("Author");
    expect(document.getElementById("metadata-notes")?.textContent).toMatch(/you must review/i);
    expect(document.getElementById("metadata-download")?.textContent).toContain("cleaned-memo.docx");
    expect(fetchSpy).not.toHaveBeenCalled();

    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    document.getElementById("metadata-download")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(create).toHaveBeenCalled();

    document.getElementById("clear-session")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("metadata-result")?.hasAttribute("hidden")).toBe(true);
    expect(document.body.textContent).not.toContain("Zelda Quinn");
  });
});
