import { describe, expect, it } from "vitest";
import { scrub } from "../src/index.js";

describe("legal recognizers and known parties", () => {
  it("catches case, docket, matter, and bates numbers", async () => {
    const { text, mapping } = await scrub(
      "Case No. 1:24-cv-04567. Docket No. 1:24-cv-04567. Matter No. 24-1188. Bates ABC-000100 through ABC-000120.",
    );
    const caseTokens = Object.entries(mapping).filter(([, value]) => value === "1:24-cv-04567");
    expect(caseTokens).toHaveLength(1);
    const token = caseTokens[0]?.[0] ?? "";
    expect(token).toBe("[CASE_1]");
    expect(text).toContain(`Case No. ${token}`);
    expect(text).toContain(`Docket No. ${token}`);
    expect(text).not.toContain("24-1188");
    expect(text).not.toContain("ABC-000100");
    expect(text).not.toContain("ABC-000120");
    expect(text).toContain("[MATTER_1]");
    expect(text).toContain("[BATES_1]");
    expect(text).toContain("[BATES_2]");
  });

  it("reads judge, party, caption, and versus cues", async () => {
    const caption = await scrub(`Alex Rivera,\n    Plaintiff,\nv.\nJordan Quinn,\n    Defendant.\nJudge Harper Quinn denied it.`);
    expect(caption.text).not.toContain("Alex Rivera");
    expect(caption.text).not.toContain("Jordan Quinn");
    expect(caption.text).not.toContain("Harper Quinn");
    expect(caption.text).toContain("Judge ");
    expect(caption.text).toContain("Plaintiff");
    expect(caption.text).toContain("v.");

    const versus = await scrub("See Rivera v. Quinn, the earlier filing.");
    expect(versus.text).not.toContain("Rivera");
    expect(versus.text).not.toContain("Quinn");
    expect(versus.text).toContain(" v. ");
  });

  it("matches a known party, titles, and the bare surname, and skips lookalikes", async () => {
    const { text, findings } = await scrub(
      "Sam Doe, Mr. Doe, and Doe signed. Doebler and Does did not. jordan q. quinn called.",
      { knownParties: ["Sam Doe", "Jordan Quinn"] },
    );
    expect(text).not.toContain("Sam Doe");
    expect(text).not.toContain("Mr. Doe");
    expect(text).not.toMatch(/\bDoe\b/);
    expect(text).toContain("Doebler");
    expect(text).toContain("Does");
    expect(text).not.toContain("quinn");
    expect(findings.every((item) => item.recognizer === "known-party" || item.text.toLowerCase().includes("quinn"))).toBe(true);

    const cased = await scrub("sam doe met SAM DOE.", { knownParties: ["Sam Doe"] });
    const tokens = new Set(cased.findings.map((item) => item.placeholder));
    expect(tokens.size).toBe(1);
    expect(cased.mapping[cased.findings[0]?.placeholder ?? ""]).toBe("sam doe");
  });

  it("keeps an uncued name when the stub name model is in use", async () => {
    const { text, findings } = await scrub("Associate Pat Exampleton appeared for the defense.");
    expect(text).toContain("Pat Exampleton");
    expect(findings).toEqual([]);
  });
});
