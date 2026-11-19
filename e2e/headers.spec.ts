import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { expect, request, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildBookmarklet } from "../site/src/bookmarklet.js";
import { HEADER_CSP, OCR_HEADER_CSP, headersDocument } from "../site/src/csp.js";
import { applyHeaders } from "../site/src/headers-match.js";

const dist = join(process.cwd(), "site/dist");
const headers = headersDocument();
const SAMPLE = "Email ada@example.com or call (415) 555-0199 about the matter.";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".gz": "application/gzip",
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
    });
  });
}

function mapped(path: string): string {
  if (path === "/" || path === "/index") return "index.html";
  if (path === "/ocr") return "ocr.html";
  if (path === "/bookmarklet") return "bookmarklet.html";
  if (path === "/scrub-selection") return "scrub-selection.html";
  return path.replace(/^\/+/, "");
}

async function start(): Promise<{ server: Server; port: number }> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    if (path !== "/foreign.html") {
      const applied = applyHeaders(headers, path);
      for (const [name, values] of applied) {
        res.setHeader(name, values.length === 1 ? values[0] : values);
      }
    }
    if (path === "/ocr.html") {
      res.writeHead(307, { Location: "/ocr" });
      res.end();
      return;
    }
    if (path === "/bookmarklet.html") {
      res.writeHead(307, { Location: "/bookmarklet" });
      res.end();
      return;
    }
    if (path === "/scrub-selection.html") {
      res.writeHead(307, { Location: "/scrub-selection" });
      res.end();
      return;
    }
    if (path === "/foreign.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        `<!DOCTYPE html><html><body><p id="foreign-text">${SAMPLE}</p><button id="go" type="button">Scrub</button></body></html>`,
      );
      return;
    }
    const file = mapped(path);
    const full = join(dist, file);
    if (!full.startsWith(`${dist}/`) && full !== join(dist, "index.html")) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const body = await readFile(full);
      if (!res.hasHeader("content-type")) res.setHeader("content-type", TYPES[extname(full)] ?? "application/octet-stream");
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const port = await listen(server);
  return { server, port };
}

async function headerList(url: string, name: string): Promise<string[]> {
  const api = await request.newContext();
  try {
    const response = await api.get(url, { maxRedirects: 0 });
    return response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === name)
      .map((header) => header.value);
  } finally {
    await api.dispose();
  }
}

function watch(page: Page, errors: string[]): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("production headers give /ocr only the relaxed policy and keep the bookmarklet opener", async ({ request: api }) => {
  const { server, port } = await start();
  try {
    const site = `http://127.0.0.1:${port}`;
    expect(await headerList(`${site}/`, "content-security-policy")).toEqual([HEADER_CSP]);
    expect(await headerList(`${site}/`, "cross-origin-opener-policy")).toEqual(["same-origin"]);
    expect(await headerList(`${site}/ocr`, "content-security-policy")).toEqual([OCR_HEADER_CSP]);
    expect(await headerList(`${site}/ocr/worker.min.js`, "content-security-policy")).toEqual([OCR_HEADER_CSP]);
    const moved = await api.get(`${site}/ocr.html`, { maxRedirects: 0 });
    expect(moved.status()).toBe(307);
    expect(moved.headers()["location"]).toBe("/ocr");
    expect(await headerList(`${site}/bookmarklet`, "cross-origin-opener-policy")).toEqual(["unsafe-none"]);
    expect(await headerList(`${site}/bookmarklet`, "content-security-policy")).toEqual([HEADER_CSP]);
    expect(await headerList(`${site}/bookmarklet.html`, "cross-origin-opener-policy")).toEqual(["unsafe-none"]);
    expect(await headerList(`${site}/bookmarklet.html`, "content-security-policy")).toEqual([HEADER_CSP]);
    expect(await headerList(`${site}/scrub-selection`, "cross-origin-opener-policy")).toEqual(["unsafe-none"]);
    expect(await headerList(`${site}/scrub-selection`, "content-security-policy")).toEqual([HEADER_CSP]);
    expect(await headerList(`${site}/scrub-selection.html`, "cross-origin-opener-policy")).toEqual(["unsafe-none"]);
    expect(await headerList(`${site}/scrub-selection.html`, "content-security-policy")).toEqual([HEADER_CSP]);
    expect(await headerList(`${site}/scrub-selection/`, "content-security-policy")).toEqual([HEADER_CSP]);
    const scrubMoved = await api.get(`${site}/scrub-selection.html`, { maxRedirects: 0 });
    expect(scrubMoved.status()).toBe(307);
    expect(scrubMoved.headers()["location"]).toBe("/scrub-selection");
  } finally {
    await close(server);
  }
});

async function runBookmarklet(
  browser: Browser,
  port: number,
  code: string,
): Promise<{ popup: Page; context: BrowserContext; errors: string[]; documents: { url: string; status: number }[] }> {
  const context = await browser.newContext();
  const errors: string[] = [];
  const documents: { url: string; status: number }[] = [];
  context.on("page", (page) => watch(page, errors));
  context.on("response", (response) => {
    if (response.request().resourceType() === "document") {
      documents.push({ url: response.url(), status: response.status() });
    }
  });
  const other = await context.newPage();
  await other.goto(`http://localhost:${port}/foreign.html`);
  await other.locator("#foreign-text").evaluate((node) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await other.locator("#go").evaluate((button, source) => {
    button.addEventListener("click", () => {
      (0, eval)(source);
    });
  }, code.slice("javascript:".length));
  const popupPromise = other.waitForEvent("popup");
  await other.locator("#go").click();
  const popup = await popupPromise;
  return { popup, context, errors, documents };
}

async function expectScrubbed(popup: Page, output: string): Promise<void> {
  await expect(popup.locator(output)).toContainText("[EMAIL_", { timeout: 15_000 });
  await expect(popup.locator(output)).toContainText("[PHONE_");
  const text = await popup.locator(output).innerText();
  expect(text).not.toContain("ada@example.com");
  expect(text).not.toContain("555-0199");
  expect(text).not.toContain("(415)");
}

test("a cross-origin bookmarklet opens only the scrubbed result", async ({ browser }) => {
  const { server, port } = await start();
  const site = `http://127.0.0.1:${port}`;
  let context: BrowserContext | undefined;
  try {
    const code = buildBookmarklet(site);
    expect(code).toContain(`${site}/scrub-selection#`);
    expect(code).not.toContain("scrub-selection.html");
    const opened = await runBookmarklet(browser, port, code);
    context = opened.context;
    const popup = opened.popup;
    await popup.waitForURL(/\/scrub-selection#/);
    expect(popup.url().startsWith(`${site}/scrub-selection#`)).toBe(true);
    expect(await popup.evaluate(() => window.opener !== null)).toBe(true);
    await expectScrubbed(popup, "#scrub-output");
    await expect(popup.locator("#scrub-status")).toHaveText("Scrubbed 2 spans. You must review before you share this.");
    await expect(popup.locator("#scrub-direct")).toBeHidden();
    await expect(popup.locator("#scrub-result")).toBeVisible();
    await expect(popup.locator("#scrub-local")).toHaveText("This text was scrubbed in this tab. It was not uploaded.");
    await expect(popup.locator("#scrub-copy")).toHaveText("Copy scrubbed text");
    await expect(popup.locator("#scrub-result .footnote")).toHaveText(
      "Helps identify and replace common identifiers. You must review before sharing.",
    );
    await expect(popup.locator("#scrub-home")).toHaveAttribute("href", "/");
    await expect(popup.locator(".site-header")).toBeVisible();
    const visible = await popup.locator("body").innerText();
    expect(visible).not.toContain("Drag the link");
    expect(visible).not.toContain("Bookmarklet source");
    expect(visible).not.toContain("javascript:");
    expect(visible).not.toContain("You can read the whole thing");
    expect(visible).not.toContain("meant to be opened by the bookmarklet");
    expect(visible).toContain("Back to the home page");
    const resultDoc = opened.documents.filter((item) => item.url.includes("scrub-selection"));
    expect(resultDoc).toEqual([{ url: `${site}/scrub-selection`, status: 200 }]);
    expect(opened.errors).toEqual([]);

    await popup.setViewportSize({ width: 375, height: 740 });
    await popup.evaluate(() => document.fonts.ready);
    const layout = await popup.evaluate(() => {
      const box = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      };
      const output = document.getElementById("scrub-output");
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        outputOverflow: output ? output.scrollWidth - output.clientWidth : 99,
        header: box(".site-header"),
        title: box("h1"),
        local: box("#scrub-local"),
        status: box("#scrub-status"),
        output: box("#scrub-output"),
        copy: box("#scrub-copy"),
        footnote: box("#scrub-result .footnote"),
        home: box("#scrub-home"),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.outputOverflow).toBeLessThanOrEqual(1);
    const stack = [layout.header, layout.title, layout.local, layout.status, layout.output, layout.copy, layout.footnote, layout.home];
    for (const box of stack) {
      expect(box).not.toBeNull();
      expect(box!.left).toBeGreaterThanOrEqual(0);
      expect(box!.right).toBeLessThanOrEqual(376);
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    }
    expect(layout.copy!.height).toBeGreaterThanOrEqual(44);
    expect(layout.copy!.width).toBeGreaterThan(200);
    for (let i = 1; i < stack.length; i++) {
      expect(stack[i]!.top + 1).toBeGreaterThanOrEqual(stack[i - 1]!.bottom - 1);
    }
    expect(layout.home!.bottom).toBeLessThanOrEqual(740);
    await popup.screenshot({ path: "/tmp/scrub-selection-375.png", fullPage: true });
  } finally {
    await context?.close();
    await close(server);
  }
});

test("a saved bookmarklet that opens /bookmarklet.html#token shows only the result", async ({ browser }) => {
  const { server, port } = await start();
  const site = `http://127.0.0.1:${port}`;
  let context: BrowserContext | undefined;
  try {
    const code = buildBookmarklet(site).replaceAll("/scrub-selection#", "/bookmarklet.html#");
    expect(code).toContain(`${site}/bookmarklet.html#`);
    expect(code).not.toContain("/scrub-selection#");
    const opened = await runBookmarklet(browser, port, code);
    context = opened.context;
    const popup = opened.popup;
    await popup.waitForURL(/\/bookmarklet#/);
    expect(popup.url().startsWith(`${site}/bookmarklet#`)).toBe(true);
    expect(await popup.evaluate(() => window.opener !== null)).toBe(true);
    await expectScrubbed(popup, "#bookmarklet-output");
    await expect(popup.locator("#bookmarklet-status")).toHaveText("Scrubbed 2 spans. You must review before you share this.");
    await expect(popup.locator("#bookmarklet-install")).toBeHidden();
    await expect(popup.locator("#bookmarklet-source")).toBeHidden();
    await expect(popup.locator("#bookmarklet-result")).toBeVisible();
    const visible = await popup.locator("body").innerText();
    expect(visible).toContain("Scrubbed selection");
    expect(visible).toContain("Copy scrubbed text");
    expect(visible).toContain("Helps identify and replace common identifiers. You must review before sharing.");
    expect(visible).not.toContain("Drag the link");
    expect(visible).not.toContain("Bookmarklet source");
    expect(visible).not.toContain("javascript:");
    expect(visible).not.toContain("You can read the whole thing");
    expect(visible).not.toContain(SAMPLE);
    const bookmarkletDocs = opened.documents.filter((item) => item.url.includes("/bookmarklet"));
    expect(bookmarkletDocs.map((item) => item.status)).toEqual([307, 200]);
    expect(bookmarkletDocs[0]?.url).toBe(`${site}/bookmarklet.html`);
    expect(bookmarkletDocs[1]?.url).toBe(`${site}/bookmarklet`);
    expect(opened.errors).toEqual([]);
  } finally {
    await context?.close();
    await close(server);
  }
});

test("scrub-selection explains itself when the bookmarklet did not open it", async ({ browser }) => {
  const { server, port } = await start();
  const site = `http://127.0.0.1:${port}`;
  const context = await browser.newContext();
  const errors: string[] = [];
  try {
    const bare = await context.newPage();
    watch(bare, errors);
    await bare.setViewportSize({ width: 375, height: 740 });
    await bare.goto(`${site}/scrub-selection`);
    await expect(bare.locator("#scrub-direct")).toBeVisible();
    await expect(bare.locator("#scrub-direct")).toContainText("This page is meant to be opened by the bookmarklet.");
    await expect(bare.locator('#scrub-direct a[href="/bookmarklet"]')).toBeVisible();
    await expect(bare.locator("#scrub-result")).toBeHidden();
    await expect(bare.locator(".site-header")).toBeVisible();
    const hashed = await context.newPage();
    watch(hashed, errors);
    await hashed.goto(`${site}/scrub-selection#leftover`);
    await expect(hashed.locator("#scrub-direct")).toBeVisible();
    await expect(hashed.locator("#scrub-result")).toBeHidden();
    expect(await hashed.evaluate(() => window.opener)).toBeNull();
    expect(errors).toEqual([]);
    await bare.screenshot({ path: "/tmp/scrub-selection-empty-375.png", fullPage: true });
  } finally {
    await context.close();
    await close(server);
  }
});

test("the main page self-test makes no network requests while offline", async ({ browser }) => {
  const { server, port } = await start();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const hits: string[] = [];
    page.on("request", (req) => hits.push(req.url()));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      const ready = (window as unknown as { __pageChunksReady?: Promise<void> }).__pageChunksReady;
      if (!ready) throw new Error("tool chunks were not started with the page");
      await ready;
    });
    const before = hits.length;
    await context.setOffline(true);
    await page.locator("#self-test-button").click();
    await expect(page.locator("#self-test-result")).toContainText("Resource timing recorded 0 requests");
    expect(hits.slice(before)).toEqual([]);
  } finally {
    await context.close();
    await close(server);
  }
});
