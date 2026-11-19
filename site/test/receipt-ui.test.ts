// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../src/app.js";
import { mountHidden } from "../src/hidden-panel.js";
import { unzip } from "../src/metadata/zip.js";
import { mountMetadata } from "../src/metadata-panel.js";

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
  mountHidden(document);
}

describe("receipt and hidden-content panels", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads a receipt without original values or network calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    load();
    const source = document.getElementById("source-text");
    const scrub = document.getElementById("scrub-button");
    if (!(source instanceof HTMLTextAreaElement) || !(scrub instanceof HTMLButtonElement)) throw new Error("missing");
    source.value = "Ada Lovelace emailed ada@example.com.";
    source.ownerDocument.getElementById("known-parties");
    const parties = document.getElementById("known-parties");
    if (parties instanceof HTMLTextAreaElement) parties.value = "Ada Lovelace";
    scrub.click();
    await vi.waitFor(() => {
      expect(document.getElementById("step-review")?.hasAttribute("hidden")).toBe(false);
    });
    expect(document.getElementById("receipt-hint")?.textContent).toMatch(/does not send|nothing is sent/i);
    expect(document.getElementById("receipt-values")).toBeInstanceOf(HTMLInputElement);
    expect((document.getElementById("receipt-values") as HTMLInputElement).checked).toBe(false);

    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blob = value as Blob;
      return "blob:local";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    document.getElementById("download-receipt")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(blob).toBeInstanceOf(Blob));
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    const entries = await unzip(bytes);
    const json = new TextDecoder().decode(entries.find((entry) => entry.name === "receipt.json")?.data);
    const readable = new TextDecoder().decode(entries.find((entry) => entry.name === "receipt.txt")?.data);
    expect(json).not.toContain("Ada Lovelace");
    expect(json).not.toContain("ada@example.com");
    expect(json).toContain("scrubbedTextSha256");
    expect(json).not.toContain("valueSha256");
    expect(json).not.toContain("lightdrawerFingerprint");
    expect(readable).toMatch(/you must review/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
