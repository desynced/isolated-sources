// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../src/app.js";
import { mountMetadata } from "../src/metadata-panel.js";

function importPath(): string {
  const href = import.meta.url;
  const marker = "file://";
  if (!href.startsWith(marker)) throw new Error(`Unexpected module URL ${href}`);
  return decodeURIComponent(href.slice(marker.length));
}

describe("airplane-mode self-test", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports 0 requests on the main page", async () => {
    const calls = { fetch: 0, xhr: 0, ws: 0, beacon: 0 };
    vi.stubGlobal("fetch", () => {
      calls.fetch += 1;
      return Promise.reject(new Error("blocked"));
    });
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          calls.ws += 1;
        }
      },
    );
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function openStub(this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest["open"]>) {
      calls.xhr += 1;
      return open.apply(this, args);
    };
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: () => {
        calls.beacon += 1;
        return false;
      },
    });

    const html = readFileSync(join(dirname(importPath()), "../index.html"), "utf8");
    const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? "";
    document.body.innerHTML = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    mount(document);
    mountMetadata(document);

    const source = document.getElementById("source-text");
    const scrub = document.getElementById("scrub-button");
    if (!(source instanceof HTMLTextAreaElement) || !(scrub instanceof HTMLButtonElement)) {
      throw new Error("missing scrub controls");
    }
    source.value = "Email alex@example.com about Case No. 1:24-cv-04567.";
    scrub.click();
    await vi.waitFor(() => {
      expect(document.getElementById("step-review")?.hasAttribute("hidden")).toBe(false);
    });
    document.getElementById("view-compare")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("copy-prompt-general");
    const copy = [...document.querySelectorAll("button")].find((item) => item.textContent === "Copy general prompt");
    copy?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(calls).toEqual({ fetch: 0, xhr: 0, ws: 0, beacon: 0 });
    XMLHttpRequest.prototype.open = open;
  });

  it("keeps file cleaning off the main bundle until the user picks a file", () => {
    const here = dirname(importPath());
    const main = readFileSync(join(here, "../src/main.ts"), "utf8");
    const app = readFileSync(join(here, "../src/app.ts"), "utf8");
    const panel = readFileSync(join(here, "../src/metadata-panel.ts"), "utf8");
    expect(main + app).not.toContain("metadata/strip");
    expect(panel).toContain('import("./metadata/strip.js")');
    expect(panel).not.toMatch(/\bfetch\s*\(/);
    expect(panel).not.toMatch(/\bXMLHttpRequest\b/);
    expect(panel).not.toMatch(/\bWebSocket\b/);
    expect(panel).not.toMatch(/\bsendBeacon\b/);
  });
});
