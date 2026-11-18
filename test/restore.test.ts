import { describe, expect, it } from "vitest";
import { restore, scrub } from "../src/index.js";

describe("exact restore", () => {
  it("puts every exact placeholder back", async () => {
    const original = "Email jordan.quinn@example.com about case 1:24-cv-04567.";
    const { text, mapping } = await scrub(original);
    const back = restore(text, mapping);
    expect(back.missing).toEqual([]);
    expect(back.altered).toEqual([]);
    expect(back.text).toBe(original);
  });

  it("restores the tokens that survived a rewrite and reports the one that was dropped", async () => {
    const { text, mapping } = await scrub("Alex Rivera emailed jordan.quinn@example.com.", {
      knownParties: ["Alex Rivera"],
    });
    const person = Object.entries(mapping).find(([, value]) => value === "Alex Rivera")?.[0];
    const email = Object.entries(mapping).find(([, value]) => value.includes("@"))?.[0];
    expect(person).toBeDefined();
    expect(email).toBeDefined();
    const rewritten = text.replace("emailed", "wrote").replace(person ?? "", "");
    const back = restore(rewritten, mapping);
    expect(back.missing).toEqual([person]);
    expect(back.text).toContain("jordan.quinn@example.com");
    expect(back.text).toContain("wrote");
    expect(back.text).not.toContain("Alex Rivera");
  });

  it("reports case, spacing, and unknown placeholders without guessing", async () => {
    const mapping = { "[PERSON_1]": "Alex Rivera", "[CASE_1]": "1:24-cv-04567" };
    const output = "Hello [person_1], see [PERSON_1 ] and [CASE_99] and PERSON_1. [Id. at 4] stands.";
    const back = restore(output, mapping);
    expect(back.text).toBe(output);
    expect(back.missing).toEqual(["[CASE_1]", "[PERSON_1]"]);
    expect(back.altered).toEqual(["PERSON_1", "[CASE_99]", "[PERSON_1 ]", "[person_1]"].sort());
  });

  it("does not treat a longer token as a shorter one", () => {
    const back = restore("See [PERSON_12] and [PERSON_1].", { "[PERSON_1]": "Alex Rivera" });
    expect(back.text).toBe("See [PERSON_12] and Alex Rivera.");
    expect(back.altered).toEqual(["[PERSON_12]"]);
    expect(back.missing).toEqual([]);
  });
});
