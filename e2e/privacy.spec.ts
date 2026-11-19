import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { expect, request, test } from "@playwright/test";
import { HEADER_CSP, headersDocument } from "../site/src/csp.js";
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
    const applied = applyHeaders(headers, path);
    for (const [name, values] of applied) {
      res.setHeader(name, values.length === 1 ? values[0] : values);
    }
    if (path === "/privacy.html") {
      res.writeHead(307, { Location: "/privacy" });
      res.end();
      return;
    }
    const mapped = path === "/privacy" ? "privacy.html" : path.replace(/^\/+/, "");
    const full = join(dist, mapped);
    if (!full.startsWith(`${dist}/`) && full !== join(dist, "privacy.html")) {
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

test("privacy page under production headers makes no console or CSP errors", async ({ browser }) => {
  const { server, port } = await start();
  try {
    const site = `http://127.0.0.1:${port}`;
    const api = await request.newContext();
    const moved = await api.get(`${site}/privacy.html`, { maxRedirects: 0 });
    expect(moved.status()).toBe(307);
    expect(moved.headers()["location"]).toBe("/privacy");
    const response = await api.get(`${site}/privacy`);
    const policies = response.headersArray().filter((header) => header.name.toLowerCase() === "content-security-policy");
    expect(policies.map((header) => header.value)).toEqual([HEADER_CSP]);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    await api.dispose();

    const page = await browser.newPage({ viewport: { width: 375, height: 740 } });
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (req) => errors.push(`${req.url()} ${req.failure()?.errorText ?? ""}`));
    page.on("request", (req) => requests.push(req.url()));

    const loaded = await page.goto(`${site}/privacy`, { waitUntil: "networkidle" });
    expect(loaded?.status()).toBe(200);
    expect(errors).toEqual([]);
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      expect(new URL(url).origin).toBe(site);
    }
    expect(requests.some((url) => url.includes(".js"))).toBe(false);

    await expect(page.locator("h1")).toHaveText("How Isolated Sources handles your information");
    await expect(page.locator("footer a[href='/privacy']")).toHaveText("Privacy");
    const metaPolicies = await page.locator('meta[http-equiv="Content-Security-Policy"]').count();
    expect(metaPolicies).toBe(1);
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("github");
    expect(body).not.toContain("presidio");

    const fit = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
    for (const selector of ["header.site-header", "h1", "h2", "footer.site-footer", "footer a[href='/privacy']"]) {
      const boxes = await page.locator(selector).all();
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        const bounds = await box.boundingBox();
        expect(bounds, selector).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
        expect(bounds!.width).toBeGreaterThan(0);
        expect(bounds!.height).toBeGreaterThan(0);
      }
    }
    await page.screenshot({ path: "/tmp/privacy-375.png", fullPage: true });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
