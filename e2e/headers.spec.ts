import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { expect, request, test, type Browser, type Page } from "@playwright/test";
import { buildBookmarklet } from "../site/src/bookmarklet.js";
import { HEADER_CSP, OCR_HEADER_CSP, headersDocument } from "../site/src/csp.js";
import { applyHeaders } from "../site/src/headers-match.js";

const dist = join(process.cwd(), "site/dist");
const headers = headersDocument();

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
    const redirects: Record<string, string> = {
      "/ocr.html": "/ocr",
      "/bookmarklet.html": "/bookmarklet",
      "/scrub-selection.html": "/scrub-selection",
    };
    if (redirects[path]) {
      res.writeHead(307, { Location: redirects[path] });
      res.end();
      return;
    }
    if (path === "/foreign.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        `<!DOCTYPE html><html><body><p id="foreign-text">Email ada@example.com or call (415) 555-0134 about the matter.</p><button id="go" type="button">Scrub</button></body></html>`,
      );
      return;
    }
    const files: Record<string, string> = {
      "/": "index.html",
      "/index": "index.html",
      "/ocr": "ocr.html",
      "/bookmarklet": "bookmarklet.html",
      "/scrub-selection": "scrub-selection.html",
    };
    const mapped = files[path] ?? path.replace(/^\/+/, "");
    const full = join(dist, mapped);
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

function retarget(bookmarklet: string, site: string, path: string): string {
  const from = `${site}/scrub-selection#`;
  const to = `${site}${path}#`;
  if (!bookmarklet.includes(from)) throw new Error("bookmarklet is missing the result page");
  return bookmarklet.replace(from, to);
}

async function openSelection(browser: Browser, port: number, code: string): Promise<{ popup: Page; errors: string[]; documents: string[] }> {
  const context = await browser.newContext();
  const errors: string[] = [];
  const documents: string[] = [];
  context.on("page", (page) => {
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      if (req.resourceType() === "document") documents.push(req.url());
    });
  });
  const opener = await context.newPage();
  await opener.goto(`http://localhost:${port}/foreign.html`);
  await opener.locator("#foreign-text").evaluate((node) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await opener.locator("#go").evaluate((button, source) => {
    button.addEventListener("click", () => {
      (0, eval)(source);
    });
  }, code.slice("javascript:".length));
  const popupPromise = opener.waitForEvent("popup");
  await opener.locator("#go").click();
  const popup = await popupPromise;
  return { popup, errors, documents };
}

test("production headers give /ocr only the relaxed policy and open the scrubbed result", async ({ browser }) => {
  const { server, port } = await start();
  try {
    const site = `http://127.0.0.1:${port}`;
    expect(await headerList(`${site}/`, "content-security-policy")).toEqual([HEADER_CSP]);
    expect(await headerList(`${site}/`, "cross-origin-opener-policy")).toEqual(["same-origin"]);
    expect(await headerList(`${site}/ocr`, "content-security-policy")).toEqual([OCR_HEADER_CSP]);
    expect(await headerList(`${site}/ocr/worker.min.js`, "content-security-policy")).toEqual([OCR_HEADER_CSP]);
    const redirect = await request.newContext();
    const moved = await redirect.get(`${site}/ocr.html`, { maxRedirects: 0 });
    expect(moved.status()).toBe(307);
    expect(moved.headers()["location"]).toBe("/ocr");
    const selectionMoved = await redirect.get(`${site}/scrub-selection.html`, { maxRedirects: 0 });
    expect(selectionMoved.status()).toBe(307);
    expect(selectionMoved.headers()["location"]).toBe("/scrub-selection");
    await redirect.dispose();
    for (const path of ["/bookmarklet", "/bookmarklet.html", "/scrub-selection", "/scrub-selection.html"]) {
      expect(await headerList(`${site}${path}`, "cross-origin-opener-policy")).toEqual(["unsafe-none"]);
      expect(await headerList(`${site}${path}`, "content-security-policy")).toEqual([HEADER_CSP]);
    }

    const bookmarklet = buildBookmarklet(site);
    expect(bookmarklet).toContain(`${site}/scrub-selection#`);
    expect(bookmarklet).not.toContain(".html");
    const opened = await openSelection(browser, port, bookmarklet);
    const popup = opened.popup;
    await popup.waitForURL(/\/scrub-selection#/);
    expect(new URL(popup.url()).hostname).toBe("127.0.0.1");
    expect(popup.url().startsWith(`${site}/scrub-selection#`)).toBe(true);
    expect(popup.url()).not.toContain(".html");
    expect(opened.documents.some((url) => url.includes("/scrub-selection.html"))).toBe(false);
    expect(await popup.evaluate(() => window.opener !== null)).toBe(true);
    await expect(popup.locator("#scrub-output")).toContainText("[EMAIL_", { timeout: 15_000 });
    await expect(popup.locator("#scrub-output")).toContainText("[PHONE_");
    const output = await popup.locator("#scrub-output").innerText();
    expect(output).not.toContain("ada@example.com");
    expect(output).not.toContain("555-0134");
    await expect(popup.locator("#scrub-result")).toBeVisible();
    await expect(popup.locator("#scrub-empty")).toBeHidden();
    await expect(popup.locator("#scrub-waiting")).toBeHidden();
    await expect(popup.locator("#scrub-local")).toHaveText("The text was scrubbed in this tab. It was not uploaded.");
    await expect(popup.locator("#scrub-status")).toContainText("Scrubbed 2 spans");
    await expect(popup.locator("#scrub-copy")).toHaveText("Copy scrubbed text");
    await expect(popup.locator(".footnote")).toHaveText("Helps identify and replace common identifiers. You must review before sharing.");
    await expect(popup.locator("#scrub-home")).toHaveAttribute("href", "/");
    const visible = await popup.locator("body").innerText();
    expect(visible).not.toContain("Drag the link");
    expect(visible).not.toContain("Bookmarklet source");
    expect(visible).not.toContain("javascript:");
    expect(opened.errors).toEqual([]);

    await popup.setViewportSize({ width: 375, height: 740 });
    await popup.screenshot({ path: "/tmp/scrub-selection-375.png", fullPage: true });
    const fit = await popup.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
    for (const selector of ["header.site-header", "#scrub-local", "#scrub-status", "#scrub-output", "#scrub-copy", ".footnote", "#scrub-home"]) {
      const box = await popup.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    }

    const direct = await popup.context().newPage();
    await direct.setViewportSize({ width: 375, height: 740 });
    const directErrors: string[] = [];
    direct.on("console", (message) => {
      if (message.type() === "error") directErrors.push(message.text());
    });
    direct.on("pageerror", (error) => directErrors.push(error.message));
    await direct.goto(`${site}/scrub-selection`);
    await expect(direct.locator("#scrub-empty")).toBeVisible();
    await expect(direct.locator("#scrub-empty a")).toHaveAttribute("href", "/bookmarklet");
    await expect(direct.locator("#scrub-result")).toBeHidden();
    await direct.goto(`${site}/scrub-selection#token`);
    await expect(direct.locator("#scrub-empty")).toBeVisible();
    await expect(direct.locator("#scrub-result")).toBeHidden();
    expect(directErrors).toEqual([]);
    const directFit = await direct.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(directFit).toBe(true);
    await direct.screenshot({ path: "/tmp/scrub-selection-empty-375.png", fullPage: true });

    const legacyCode = retarget(bookmarklet, site, "/bookmarklet");
    const legacy = await openSelection(browser, port, legacyCode);
    await legacy.popup.waitForURL(/\/bookmarklet#/);
    expect(legacy.popup.url().startsWith(`${site}/bookmarklet#`)).toBe(true);
    expect(await legacy.popup.evaluate(() => window.opener !== null)).toBe(true);
    await expect(legacy.popup.locator("#bookmarklet-output")).toContainText("[EMAIL_", { timeout: 15_000 });
    await expect(legacy.popup.locator("#bookmarklet-output")).toContainText("[PHONE_");
    const legacyOutput = await legacy.popup.locator("#bookmarklet-output").innerText();
    expect(legacyOutput).not.toContain("ada@example.com");
    expect(legacyOutput).not.toContain("555-0134");
    await expect(legacy.popup.locator("#bookmarklet-install")).toBeHidden();
    await expect(legacy.popup.locator("#bookmarklet-source")).toBeHidden();
    await expect(legacy.popup.locator("#bookmarklet-result")).toBeVisible();
    const legacyText = await legacy.popup.locator("body").innerText();
    expect(legacyText).not.toContain("Drag the link");
    expect(legacyText).not.toContain("Bookmarklet source");
    expect(legacyText).not.toContain("javascript:");
    expect(legacy.errors).toEqual([]);

    const install = await popup.context().newPage();
    await install.goto(`${site}/bookmarklet`);
    await expect(install.locator("#bookmarklet-install")).toBeVisible();
    await expect(install.locator("#bookmarklet-source")).toContainText(`${site}/scrub-selection#`);
    await expect(install.locator("#bookmarklet-result")).toBeHidden();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
