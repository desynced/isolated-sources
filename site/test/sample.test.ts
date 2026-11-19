import { describe, expect, it } from "vitest";
import { restore } from "../../src/index.js";
import { parseParties, runScrub } from "../src/review.js";
import { SAMPLE_PARTIES, SAMPLE_TEXT, buildSampleAnswer } from "../src/sample.js";

describe("try a sample", () => {
  it("drops one placeholder, alters another, and does not guess", async () => {
    const state = await runScrub(SAMPLE_TEXT, parseParties(SAMPLE_PARTIES));
    expect(state.scrubbed).toContain("Judge ");
    expect(state.scrubbed).toContain("Plaintiff");
    expect(state.scrubbed).toContain(" v.");
    expect(state.scrubbed).not.toContain("Jordan Quinn");
    expect(state.scrubbed).not.toContain("Alex Rivera");
    expect(state.scrubbed).not.toContain("jordan.quinn@example.com");
    expect(state.scrubbed).not.toContain("1:24-cv-04567");
    expect(state.scrubbed).not.toContain("24-1188");
    expect(state.scrubbed).not.toContain("ABC-000100");
    expect(state.findings.some((item) => item.recognizer === "known-party")).toBe(true);
    expect(state.findings.some((item) => item.recognizer === "judge-party")).toBe(true);
    expect(state.findings.some((item) => item.recognizer === "case-number" || item.recognizer === "docket-number")).toBe(
      true,
    );
    expect(state.findings.some((item) => item.recognizer === "matter-number")).toBe(true);
    expect(state.findings.some((item) => item.recognizer === "bates-number")).toBe(true);

    const sample = buildSampleAnswer(state.scrubbed, state.mapping);
    expect(sample).not.toBeNull();
    if (!sample) return;
    const keys = Object.keys(state.mapping).sort();
    expect(sample.dropped).toBe(keys[0]);
    expect(sample.altered).toBe(keys[1]?.toLowerCase());
    expect(sample.answer).not.toContain(sample.dropped);
    expect(sample.answer).toContain(sample.altered);

    const back = restore(sample.answer, state.mapping);
    const exactForm = sample.altered.toUpperCase();
    expect(back.missing).toEqual([sample.dropped, exactForm].sort());
    expect(back.altered).toContain(sample.altered);
    expect(back.text).not.toContain(state.mapping[exactForm]);
    expect(back.text).not.toContain(state.mapping[sample.dropped]);
    expect(back.text).toContain(sample.altered);
  });
});
