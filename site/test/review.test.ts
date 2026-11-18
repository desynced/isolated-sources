import { describe, expect, it } from "vitest";
import { restore } from "../../src/index.js";
import { addResidual, addSpan, mapScrubbedSpan, parseParties, runScrub, unflag } from "../src/review.js";

const TEXT = `Alex Rivera emailed jordan.quinn@example.com about Case No. 1:24-cv-04567.
Associate Pat Exampleton appeared. Reference 4155550199 in the index.`;

describe("review session", () => {
  it("parses one party per line", () => {
    expect(parseParties("Alex Rivera\n\nJordan Quinn\n  \n")).toEqual(["Alex Rivera", "Jordan Quinn"]);
  });

  it("scrubs, un-flags without keeping the token, adds a selection, and does not guess", async () => {
    const state = await runScrub(TEXT, ["Alex Rivera"]);
    expect(state.scrubbed).not.toContain("jordan.quinn@example.com");
    expect(state.scrubbed).not.toContain("Alex Rivera");
    expect(state.scrubbed).not.toContain("1:24-cv-04567");
    expect(state.scrubbed).toContain("Pat Exampleton");
    expect(state.residual.some((item) => item.text === "4155550199")).toBe(true);

    const round = restore(state.scrubbed, state.mapping);
    expect(round.missing).toEqual([]);
    expect(round.altered).toEqual([]);
    expect(round.text).toBe(TEXT);

    const email = state.findings.find((item) => item.text.includes("@"));
    expect(email?.recognizer).toBe("email");
    expect(email).toBeDefined();
    const dropped = await unflag(state, email?.start ?? 0, email?.end ?? 0);
    expect(dropped.scrubbed).toContain("jordan.quinn@example.com");
    expect(dropped.scrubbed).not.toContain(email?.placeholder ?? "missing");
    expect(dropped.mapping[email?.placeholder ?? ""]).toBeUndefined();
    expect(dropped.session.mapping()[email?.placeholder ?? ""]).toBe(email?.text);
    expect(dropped.residual.some((item) => item.text === "jordan.quinn@example.com")).toBe(true);
    const afterUnflag = restore(dropped.scrubbed, dropped.mapping);
    expect(afterUnflag.missing).not.toContain(email?.placeholder);

    const alex = state.findings.find((item) => item.text === "Alex Rivera");
    expect(alex).toBeDefined();
    const shown = await unflag(state, alex?.start ?? 0, alex?.end ?? 0);
    expect(shown.residual.some((item) => item.text === "Alex Rivera")).toBe(true);

    const start = TEXT.indexOf("Pat Exampleton");
    const added = await addSpan(dropped, start - 1, start + "Pat Exampleton".length + 1, "PERSON");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.state.scrubbed).not.toContain("Pat Exampleton");
    expect(added.state.findings.some((item) => item.recognizer === "you" && item.text === "Pat Exampleton")).toBe(true);
    expect(added.state.findings.find((item) => item.text === "Pat Exampleton")?.score).toBe(1);

    const overlap = await addSpan(added.state, start, start + 4, "PERSON");
    expect(overlap.ok).toBe(false);

    const phone = state.residual.find((item) => item.text === "4155550199");
    expect(phone).toBeDefined();
    if (!phone) return;
    const flagged = await addResidual(state, phone);
    expect(flagged.ok).toBe(true);
    if (!flagged.ok) return;
    expect(flagged.state.scrubbed).toContain("[PHONE_1]");
    expect(flagged.state.scrubbed).not.toContain("4155550199");
    expect(flagged.state.residual.some((item) => item.text === "4155550199")).toBe(false);

    const person = Object.keys(state.mapping).find((key) => key.startsWith("[PERSON_"));
    expect(person).toBeDefined();
    const lowered = person?.toLowerCase() ?? "";
    const answer = `Note ${lowered} and [CASE_99].`;
    const back = restore(answer, state.mapping);
    expect(back.text).toBe(answer);
    expect(back.altered).toContain(lowered);
    expect(back.altered).toContain("[CASE_99]");
    expect(back.missing).toContain(person);
    expect(back.text).not.toContain("Alex Rivera");
    expect(back.text).not.toContain("1:24-cv-04567");
  });

  it("keeps a shared placeholder when only one copy is un-flagged", async () => {
    const state = await runScrub("Email a@example.com and later a@example.com.", []);
    expect(new Set(state.findings.map((item) => item.placeholder)).size).toBe(1);
    const first = state.findings[0];
    expect(first).toBeDefined();
    if (!first) return;
    const kept = await unflag(state, first.start, first.end);
    expect(kept.scrubbed).toContain("a@example.com");
    expect(kept.scrubbed).toContain(first.placeholder);
    expect(kept.mapping[first.placeholder]).toBe("a@example.com");
  });

  it("maps a scrubbed span back onto the source and rejects placeholders", async () => {
    const state = await runScrub(TEXT, ["Alex Rivera"]);
    const phone = state.residual.find((item) => item.text === "4155550199");
    expect(phone).toBeDefined();
    if (!phone) return;
    const mapped = mapScrubbedSpan(state.source, state.findings, phone.start, phone.end);
    expect(state.source.slice(mapped?.start ?? 0, mapped?.end ?? 0)).toBe("4155550199");

    const placeholder = state.scrubbed.indexOf("[");
    expect(mapScrubbedSpan(state.source, state.findings, placeholder, placeholder + 4)).toBeNull();
  });

  it("rejects an unknown kind and an empty selection", async () => {
    const state = await runScrub("Associate Pat Exampleton appeared.", []);
    const start = state.source.indexOf("Pat");
    const bad = await addSpan(state, start, start + 3, "NOT_A_KIND");
    expect(bad.ok).toBe(false);
    const empty = await addSpan(state, start, start, "PERSON");
    expect(empty.ok).toBe(false);
  });
});
