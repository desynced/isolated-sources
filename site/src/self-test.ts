import { restore } from "../../src/index.js";
import { runScrub } from "./review.js";

const SAMPLE = "Jordan Quinn emailed jordan.quinn@example.com about Case No. 1:24-cv-04567.";
const PARTIES = ["Jordan Quinn"];

export interface SelfTestReport {
  roundTrip: boolean;
  missing: number;
  altered: number;
  /** Null when this page could not read resource timing. */
  requests: number | null;
}

interface Timed {
  name: string;
  startTime: number;
}

function readResources(): Timed[] | null {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return null;
  try {
    const entries = performance.getEntriesByType("resource");
    if (!Array.isArray(entries)) return null;
    return entries.map((entry) => ({ name: String(entry.name), startTime: Number(entry.startTime) }));
  } catch {
    return null;
  }
}

function keyOf(entry: Timed): string {
  return `${entry.startTime}\u0000${entry.name}`;
}

function tally(entries: readonly Timed[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = keyOf(entry);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function countNew(before: readonly Timed[], after: readonly Timed[], observed: readonly Timed[]): number {
  const beforeMap = tally(before);
  const afterMap = tally(after);
  let requests = 0;
  const counted = new Set<string>();
  for (const [key, count] of afterMap) {
    const added = count - (beforeMap.get(key) ?? 0);
    if (added > 0) {
      requests += added;
      counted.add(key);
    }
  }
  for (const entry of observed) {
    const key = keyOf(entry);
    if (counted.has(key) || (beforeMap.get(key) ?? 0) > 0) continue;
    requests += 1;
    counted.add(key);
  }
  return requests;
}

/**
 * Scrub and restore a fixed sample, and count resource-timing entries for that run.
 * A null request count means the browser did not expose timing, not that the count was zero.
 */
export async function runSelfTest(): Promise<SelfTestReport> {
  const observed: Timed[] = [];
  let observer: PerformanceObserver | null = null;
  if (typeof PerformanceObserver === "function") {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "resource") {
            observed.push({ name: entry.name, startTime: entry.startTime });
          }
        }
      });
      observer.observe({ type: "resource", buffered: false });
    } catch {
      observer = null;
    }
  }

  const before = readResources();
  let roundTrip = false;
  let missing = 0;
  let altered = 0;
  try {
    const state = await runScrub(SAMPLE, PARTIES);
    const restored = restore(state.scrubbed, state.mapping);
    missing = restored.missing.length;
    altered = restored.altered.length;
    roundTrip = restored.text === SAMPLE && missing === 0 && altered === 0;
  } finally {
    if (observer) {
      try {
        const pending = observer.takeRecords();
        for (const entry of pending) {
          if (entry.entryType === "resource") {
            observed.push({ name: entry.name, startTime: entry.startTime });
          }
        }
      } catch {
        // Resource timing already failed to observe. The count stays unavailable.
      }
      observer.disconnect();
    }
  }

  const after = readResources();
  let requests: number | null = null;
  if (before && after) {
    requests = countNew(before, after, observed);
  } else if (observer) {
    requests = tally(observed).size;
  }

  return { roundTrip, missing, altered, requests };
}

export function selfTestMessage(report: SelfTestReport): string {
  const outcome = report.roundTrip
    ? "Scrubbed the sample and restored every exact placeholder."
    : `Scrubbed the sample. Restore left ${report.missing} missing and ${report.altered} altered.`;
  const count =
    report.requests === null
      ? "Resource timing was not available, so this check cannot count requests and does not show that zero were made."
      : `Resource timing recorded ${report.requests} request${report.requests === 1 ? "" : "s"} during this run.`;
  const scope =
    "That count is only what PerformanceObserver and resource timing can see for this page. connect-src 'none' tells the browser to block connections from the page. This does not detect airplane mode, and it does not cover extensions, other apps, or the rest of the device.";
  const unavailable =
    "connect-src 'none' tells the browser to block connections from the page. This run did not probe that policy, and it does not detect airplane mode.";
  return `${outcome} ${count} ${report.requests === null ? unavailable : scope}`;
}
