import { STRICT_TRANSPORT_SECURITY } from "../site/src/csp.ts";

const APEX = "isolatedsources.com";
const WWW = "www.isolatedsources.com";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

/**
 * HTTPS location for an http request, and the apex for www.isolatedsources.com.
 * Path and query are kept. Loopback hosts are left alone so a local preview still loads.
 * Returns null when the request should be served as-is.
 */
export function redirectLocation(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const www = host === WWW;
  const http = url.protocol === "http:";
  if (!www && !http) return null;
  if (!www && LOOPBACK.has(host)) return null;
  url.protocol = "https:";
  if (www) url.hostname = APEX;
  return url.href;
}

export async function handleRequest(request: Request, assets: AssetBinding): Promise<Response> {
  const location = redirectLocation(request.url);
  if (location) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: location,
        "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY,
      },
    });
  }
  const response = await assets.fetch(request);
  if (response.headers.has("Strict-Transport-Security")) return response;
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

interface Env {
  ASSETS: AssetBinding;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env.ASSETS);
  },
};
