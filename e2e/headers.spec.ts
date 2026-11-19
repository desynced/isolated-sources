import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { expect, request, test } from "@playwright/test";
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
    if (path === "/foreign.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        `<!DOCTYPE html><html><body><p id="foreign-text">Email ada@example.com about the matter.</p><button id="go" type="button">Scrub</button></body></html>`,
      );
      return;
    }
    const mapped =
      path === "/" || path === "/index" ? "index.html" : path === "/ocr" ? "ocr.html" : path === "/bookmarklet" ? "bookmarklet.html" : path.replace(/^\/+/, "");
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

test("production headers give /ocr only the relaxed policy and keep the bookmarklet opener", async ({ browser }) => {
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
    await redirect.dispose();
    expect(await headerList(`${site}/bookmarklet`, "cross-origin-opener-policy")).toEqual(["unsafe-none"]);
    expect(await headerList(`${site}/bookmarklet`, "content-security-policy")).toEqual([HEADER_CSP]);
    expect(await headerList(`${site}/bookmarklet.html`, "cross-origin-opener-policy")).toEqual(["unsafe-none"]);

    const other = await browser.newPage();
    await other.goto(`http://localhost:${port}/foreign.html`);
    const bookmarklet = buildBookmarklet(site);
    await other.locator("#foreign-text").evaluate((node) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await other.locator("#go").evaluate((button, code) => {
      button.addEventListener("click", () => {
        (0, eval)(code);
      });
    }, bookmarklet.slice("javascript:".length));
    const popupPromise = other.waitForEvent("popup");
    await other.locator("#go").click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/bookmarklet/);
    expect(popup.url().startsWith(`${site}/bookmarklet`)).toBe(true);
    expect(await popup.evaluate(() => window.opener !== null)).toBe(true);
    await expect(popup.locator("#bookmarklet-output")).toContainText("[EMAIL_", { timeout: 15_000 });
    expect(await popup.locator("#bookmarklet-output").innerText()).not.toContain("ada@example.com");
    await other.close();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
