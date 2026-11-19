import { afterEach, describe, expect, it, vi } from "vitest";
import { runSelfTest, selfTestMessage } from "../src/self-test.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("airplane-mode self-test", () => {
  it("reports zero resource-timing requests when nothing was fetched", async () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    class QuietObserver {
      observe(): void {}
      disconnect(): void {}
      takeRecords(): PerformanceEntry[] {
        return [];
      }
    }
    vi.stubGlobal("PerformanceObserver", QuietObserver);

    const report = await runSelfTest();
    expect(report.roundTrip).toBe(true);
    expect(report.requests).toBe(0);
    const message = selfTestMessage(report);
    expect(message).toContain("Resource timing recorded 0 requests");
    expect(message).toContain("connect-src 'none'");
    expect(message).toContain("does not detect airplane mode");
    expect(message).not.toContain("jordan.quinn@example.com");
    expect(message.toLowerCase()).not.toMatch(/guaranteed|certified|compliant/);
  });

  it("counts a resource-timing entry that appears during the run", async () => {
    let calls = 0;
    vi.spyOn(performance, "getEntriesByType").mockImplementation(() => {
      calls += 1;
      if (calls === 1) return [];
      return [{ name: "https://isolatedsources.com/app.js", startTime: 5, entryType: "resource" } as PerformanceEntry];
    });
    vi.stubGlobal("PerformanceObserver", undefined);

    const report = await runSelfTest();
    expect(report.requests).toBe(1);
    expect(selfTestMessage(report)).toContain("Resource timing recorded 1 request during this run");
  });

  it("does not claim zero requests when resource timing is unavailable", async () => {
    vi.spyOn(performance, "getEntriesByType").mockImplementation(() => {
      throw new Error("no resource timing");
    });
    vi.stubGlobal("PerformanceObserver", undefined);

    const report = await runSelfTest();
    expect(report.requests).toBeNull();
    const message = selfTestMessage(report);
    expect(message).toContain("cannot count requests");
    expect(message).not.toContain("recorded 0");
    expect(message).toContain("connect-src 'none'");
    expect(message).toContain("does not detect airplane mode");
  });
});
