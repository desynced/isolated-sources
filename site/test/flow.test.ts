// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../src/app.js";
import { applyTipLink } from "../src/tip.js";

function importPath(): string {
  const href = import.meta.url;
  const marker = "file://";
  if (!href.startsWith(marker)) throw new Error(`Unexpected module URL ${href}`);
  return decodeURIComponent(href.slice(marker.length));
}

const TEXT = `Alex Rivera emailed jordan.quinn@example.com about Case No. 1:24-cv-04567.
Associate Pat Exampleton appeared. Reference 4155550199 in the index.`;

const HERO = [
  "Light and private. Pure JavaScript, no model downloads, no servers. Your text never leaves your device.",
  "Built for legal text. Catches case, docket, Bates and matter numbers, plus names from your own party list.",
  "Restores exactly, or tells you why it can't. Paste the AI's answer back and every placeholder returns as it was. If one is missing or altered, it shows you which, and never guesses.",
];

function load(): void {
  const html = readFileSync(join(dirname(importPath()), "../index.html"), "utf8");
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? "";
  document.body.innerHTML = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  mount(document);
}

function hidden(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el.hasAttribute("hidden");
}

function area(id: string): HTMLTextAreaElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTextAreaElement)) throw new Error(`Missing textarea #${id}`);
  return el;
}

function button(id: string): HTMLButtonElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`Missing button #${id}`);
  return el;
}

function finding(surface: string): HTMLElement {
  const item = [...document.querySelectorAll("#findings li")].find(
    (li) => li.querySelector(".surface")?.textContent === surface,
  );
  if (!(item instanceof HTMLElement)) throw new Error(`No finding for ${surface}`);
  return item;
}

async function scrub(): Promise<void> {
  area("source-text").value = TEXT;
  area("known-parties").value = "Alex Rivera";
  button("scrub-button").click();
  await vi.waitFor(() => {
    expect(hidden("step-review")).toBe(false);
  });
}

describe("site page", () => {
  beforeEach(() => {
    load();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the homepage copy, footer, labels, and a hidden tip link", () => {
    expect(document.querySelector("h1")?.textContent).toBe("Free PII scrubbing that stays in your browser.");
    expect([...document.querySelectorAll(".hero-points li")].map((item) => item.textContent)).toEqual(HERO);
    expect(document.getElementById("footnote")?.textContent).toBe(
      "Helps identify and replace common identifiers. You must review before sharing.",
    );
    expect(document.getElementById("review-footnote")?.textContent).toBe(
      "Helps identify and replace common identifiers. You must review before sharing.",
    );
    expect(document.querySelector('a[href="https://github.com/desynced/isolated-sources"]')?.textContent).toContain(
      "GitHub",
    );
    expect(document.querySelector('a[href*="LICENSE"]')?.textContent).toContain("MIT License");
    expect(document.body.textContent).toContain("Microsoft Presidio");
    expect(hidden("tip-item")).toBe(true);

    for (const control of document.querySelectorAll("textarea, select")) {
      expect(control.id, control.outerHTML).not.toBe("");
      expect(document.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
    }
    expect(document.querySelector("main")).not.toBeNull();
    expect(hidden("step-review")).toBe(true);
    expect(hidden("step-restore")).toBe(true);
  });

  it("shows an https tip link and hides any other value", () => {
    const anchor = document.getElementById("tip-link");
    const item = document.getElementById("tip-item");
    if (!(anchor instanceof HTMLAnchorElement) || !(item instanceof HTMLElement)) throw new Error("tip link missing");
    applyTipLink(anchor, item, "");
    expect(item.hidden).toBe(true);
    expect(anchor.hasAttribute("href")).toBe(false);
    applyTipLink(anchor, item, "javascript:alert(1)");
    expect(item.hidden).toBe(true);
    applyTipLink(anchor, item, "https://paypal.me/example");
    expect(item.hidden).toBe(false);
    expect(anchor.href).toBe("https://paypal.me/example");
  });

  it("asks for text before scrubbing", () => {
    area("source-text").value = "   \n";
    button("scrub-button").click();
    expect(document.getElementById("paste-error")?.textContent).toMatch(/Paste text/);
    expect(hidden("step-paste")).toBe(false);
  });

  it("reviews findings, un-flags, adds a selection, restores without guessing, and clears", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const logs = (["log", "info", "debug", "warn", "error"] as const).map((method) => vi.spyOn(console, method));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await scrub();

    const view = document.getElementById("scrubbed-view");
    expect(view?.querySelector("mark")?.textContent).toMatch(/\[[A-Z_]+_\d+\]/);
    expect(view?.textContent).not.toContain("Alex Rivera");
    expect(view?.textContent).not.toContain("jordan.quinn@example.com");
    expect(view?.textContent).not.toContain("1:24-cv-04567");
    expect(view?.textContent).toContain("Pat Exampleton");

    const alex = finding("Alex Rivera");
    expect(alex.querySelector('[data-field="recognizer"]')?.textContent).toContain("known-party");
    expect(alex.querySelector('[data-field="score"]')?.textContent).toMatch(/^\d\.\d\d$/);
    expect(alex.querySelector('[data-field="context"]')?.textContent).toContain("Alex Rivera");
    expect(alex.querySelector("button")?.textContent).toBe("Un-flag");

    const email = finding("jordan.quinn@example.com");
    expect(email.querySelector('[data-field="recognizer"]')?.textContent).toContain("email");
    expect(finding("1:24-cv-04567").querySelector('[data-field="recognizer"]')?.textContent).toContain("case-number");

    expect(document.getElementById("residual")?.textContent).toContain("Fail-safe re-scan");
    expect(document.getElementById("residual")?.textContent).toContain("4155550199");

    email.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(view?.textContent).toContain("jordan.quinn@example.com");
    });
    expect([...document.querySelectorAll("#findings .surface")].map((node) => node.textContent)).not.toContain(
      "jordan.quinn@example.com",
    );

    const missed = area("missed-source");
    const at = missed.value.indexOf("Pat Exampleton");
    missed.focus();
    missed.setSelectionRange(at, at + "Pat Exampleton".length);
    missed.dispatchEvent(new Event("select"));
    const kind = document.getElementById("flag-kind");
    if (!(kind instanceof HTMLSelectElement)) throw new Error("kind");
    kind.value = "PERSON";
    button("flag-selection").click();
    await vi.waitFor(() => {
      expect(view?.textContent).not.toContain("Pat Exampleton");
    });
    expect(finding("Pat Exampleton").querySelector('[data-field="recognizer"]')?.textContent).toContain("you");

    const phone = [...document.querySelectorAll("#residual li")].find((item) =>
      item.textContent?.includes("4155550199"),
    );
    expect(phone).toBeTruthy();
    phone?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(view?.textContent).not.toContain("4155550199");
    });
    expect(view?.textContent).toContain("[PHONE_1]");

    button("copy-scrubbed").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = String(writeText.mock.calls.at(-1)?.[0]);
    expect(copied).toBe(view?.textContent);
    expect(copied).not.toContain("Alex Rivera");
    expect(copied).not.toContain("Pat Exampleton");
    expect(copied).not.toContain("1:24-cv-04567");
    expect(copied).not.toContain("4155550199");
    expect(copied).toContain("jordan.quinn@example.com");
    expect(document.getElementById("status")?.textContent).toMatch(/copied/i);

    const person = finding("Alex Rivera").querySelector("mark")?.textContent ?? "";
    const caseToken = finding("1:24-cv-04567").querySelector("mark")?.textContent ?? "";
    const pat = finding("Pat Exampleton").querySelector("mark")?.textContent ?? "";
    const answer = `Update ${person.toLowerCase()} stayed. File ${caseToken.slice(0, -2)}9].`;
    button("continue-restore").click();
    expect(hidden("step-restore")).toBe(false);
    area("ai-answer").value = answer;
    button("restore-button").click();

    const restored = document.getElementById("restored-view")?.textContent ?? "";
    expect(restored).toBe(answer);
    expect(restored).not.toContain("Alex Rivera");
    expect(restored).not.toContain("1:24-cv-04567");
    expect(restored).not.toContain("Pat Exampleton");
    expect(document.getElementById("missing-list")?.textContent).toContain(caseToken);
    expect(document.getElementById("missing-list")?.textContent).toContain(pat);
    expect(document.getElementById("missing-list")?.textContent).toContain("stood for");
    expect(document.getElementById("altered-list")?.textContent).toContain(person.toLowerCase());
    expect(document.getElementById("restore-summary")?.textContent).toMatch(/not guessed/i);
    expect(document.getElementById("missing-section")?.classList.contains("is-problem")).toBe(true);

    button("clear-session").click();
    expect(hidden("step-paste")).toBe(false);
    expect(area("source-text").value).toBe("");
    expect(area("known-parties").value).toBe("");
    expect(area("ai-answer").value).toBe("");
    expect(document.body.textContent).not.toContain("jordan.quinn@example.com");
    expect(document.body.textContent).not.toContain("Alex Rivera");
    expect(document.body.textContent).not.toContain("4155550199");
    expect(document.getElementById("status")?.textContent).toMatch(/Session cleared/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    for (const spy of logs) {
      const dumped = spy.mock.calls.flat().join(" ");
      expect(dumped).not.toContain("jordan.quinn@example.com");
      expect(dumped).not.toContain("Alex Rivera");
    }
  });
});
