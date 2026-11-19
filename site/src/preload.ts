/**
 * Start same-origin tool chunks while the page is loading.
 * After load, import() resolves from the module map with the network off.
 */
const jobs: Promise<unknown>[] = [import("./metadata/strip.js")];

export const pageChunksReady: Promise<void> = Promise.all(jobs).then(() => undefined);

declare global {
  interface Window {
    __pageChunksReady?: Promise<void>;
  }
}

if (typeof window !== "undefined") {
  window.__pageChunksReady = pageChunksReady;
}
