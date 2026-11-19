import { describe, expect, it, vi } from "vitest";
import { STRICT_TRANSPORT_SECURITY } from "../src/csp.js";
import worker, { handleRequest, redirectLocation } from "../../worker/index.js";

describe("https and apex redirects", () => {
  it("sends http and www to the https apex and keeps the path and query", () => {
    expect(redirectLocation("http://isolatedsources.com/a/b?x=1&y=2")).toBe(
      "https://isolatedsources.com/a/b?x=1&y=2",
    );
    expect(redirectLocation("http://www.isolatedsources.com/a/b?x=1&y=2")).toBe(
      "https://isolatedsources.com/a/b?x=1&y=2",
    );
    expect(redirectLocation("https://www.isolatedsources.com/a/b?x=1")).toBe("https://isolatedsources.com/a/b?x=1");
    expect(redirectLocation("http://WWW.IsolatedSources.com/Path?Q=a%20b")).toBe(
      "https://isolatedsources.com/Path?Q=a%20b",
    );
    expect(redirectLocation("https://www.isolatedsources.com:8443/a/b?x=1")).toBe(
      "https://isolatedsources.com:8443/a/b?x=1",
    );
    expect(redirectLocation("http://isolated-sources.example.workers.dev/a?b=1")).toBe(
      "https://isolated-sources.example.workers.dev/a?b=1",
    );
  });

  it("leaves the https apex and local preview hosts alone", () => {
    expect(redirectLocation("https://isolatedsources.com/a?b=1")).toBeNull();
    expect(redirectLocation("http://127.0.0.1:8787/a?x=1")).toBeNull();
    expect(redirectLocation("http://localhost:5173/src/main.ts?t=1")).toBeNull();
    expect(redirectLocation("http://[::1]:8787/a")).toBeNull();
    expect(redirectLocation("not a url")).toBeNull();
  });

  it("returns a 301 with HSTS and does not read the body", async () => {
    const request = new Request("http://www.isolatedsources.com/docs/a?b=1", {
      method: "POST",
      body: "secret text",
    });
    const fetch = vi.fn();
    const response = await handleRequest(request, { fetch });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://isolatedsources.com/docs/a?b=1");
    expect(response.headers.get("Strict-Transport-Security")).toBe(STRICT_TRANSPORT_SECURITY);
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(request.bodyUsed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards other requests to assets and adds HSTS when the asset response has none", async () => {
    const request = new Request("https://isolatedsources.com/favicon.svg");
    const asset = new Response("icon", { status: 200, headers: { "Content-Type": "image/svg+xml" } });
    const fetch = vi.fn(async (seen: Request) => {
      expect(seen).toBe(request);
      return asset;
    });
    const response = await handleRequest(request, { fetch });
    expect(fetch).toHaveBeenCalledOnce();
    expect(request.bodyUsed).toBe(false);
    expect(response.headers.get("Strict-Transport-Security")).toBe(STRICT_TRANSPORT_SECURITY);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await response.text()).toBe("icon");
  });

  it("does not duplicate HSTS when assets already send it", async () => {
    const request = new Request("https://isolatedsources.com/");
    const asset = new Response("page", {
      headers: { "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY },
    });
    const response = await handleRequest(request, { fetch: async () => asset });
    expect(response).toBe(asset);
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("uses the same redirect from the worker entrypoint", async () => {
    const response = await worker.fetch(new Request("http://isolatedsources.com/a?b=1#hash"), {
      ASSETS: { fetch: async () => new Response("unused") },
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://isolatedsources.com/a?b=1#hash");
  });
});
