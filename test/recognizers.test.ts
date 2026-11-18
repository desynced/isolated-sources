import { describe, expect, it } from "vitest";
import { analyze, scrub } from "../src/index.js";

async function hits(text: string, entity: string, threshold = 0) {
  const found = await analyze(text, { threshold });
  return found.filter((item) => item.entityType === entity);
}

describe("ported recognizers", () => {
  it("flags a normal email and drops a host without a domain", async () => {
    const found = await hits("Write jordan.quinn@example.com today", "EMAIL_ADDRESS");
    expect(found).toHaveLength(1);
    expect(found[0]?.score).toBe(1);
    expect(await hits("ping user@localhost now", "EMAIL_ADDRESS")).toHaveLength(0);
  });

  it("accepts a Luhn-valid test card and drops a bad checksum", async () => {
    const valid = await hits("card 4111-1111-1111-1111 on file", "CREDIT_CARD");
    expect(valid.map((item) => item.text)).toEqual(["4111-1111-1111-1111"]);
    expect(valid[0]?.score).toBe(1);
    const spaced = await hits("card 4111 1111 1111 1111 on file", "CREDIT_CARD");
    expect(spaced.map((item) => item.text)).toEqual(["4111 1111 1111 1111"]);
    expect(await hits("card 4111-1111-1111-1112 on file", "CREDIT_CARD")).toHaveLength(0);
  });

  it("scores a dashed SSN and rejects samples, zero groups, and mixed delimiters", async () => {
    const plain = await hits("219-09-9999", "US_SSN");
    expect(plain).toHaveLength(1);
    expect(plain[0]?.score).toBeCloseTo(0.5);

    const boosted = await hits("SSN 219-09-9999", "US_SSN");
    expect(boosted[0]?.score).toBeCloseTo(0.85);
    expect(boosted[0]?.contextWord?.toLowerCase()).toBe("ssn");

    for (const sample of ["123-45-6789", "078-05-1120", "987-65-4320", "000-12-3456", "666-12-3456", "219-09.9999", "111-11-1111"]) {
      expect(await hits(sample, "US_SSN"), sample).toHaveLength(0);
    }
  });

  it("boosts a weak SSN only inside the context window", async () => {
    const near = await hits("ssn alpha beta gamma delta 219099999", "US_SSN", 0.4);
    expect(near).toHaveLength(1);
    expect(near[0]?.score).toBeCloseTo(0.4);

    const far = await hits("ssn alpha beta gamma delta epsilon 219099999", "US_SSN", 0.4);
    expect(far).toHaveLength(0);

    const after = await hits("219-09-9999 is the ssn on the form", "US_SSN");
    expect(after[0]?.score).toBeGreaterThan(0.5);
  });

  it("validates IBAN checksum and country shape, including spaces", async () => {
    const compact = await hits("Wire DE89370400440532013000 today", "IBAN_CODE");
    expect(compact.map((item) => item.text)).toEqual(["DE89370400440532013000"]);
    expect(compact[0]?.score).toBe(1);

    const spaced = await hits("Wire de89 3704 0044 0532 0130 00 today", "IBAN_CODE");
    expect(spaced).toHaveLength(1);
    const gb = await hits("Account GB82WEST12345698765432 is the sample.", "IBAN_CODE");
    expect(gb.map((item) => item.text)).toEqual(["GB82WEST12345698765432"]);

    expect(await hits("Wire DE89370400440532013001 today", "IBAN_CODE")).toHaveLength(0);
  });

  it("flags documentation IPs and URLs", async () => {
    const ip = await hits("logs 203.0.113.10 and 2001:db8::1", "IP_ADDRESS");
    expect(ip.map((item) => item.text).sort()).toEqual(["2001:db8::1", "203.0.113.10"]);

    const url = await hits("See https://dockets.example.com/case/04567 for the file.", "URL");
    expect(url).toHaveLength(1);
    expect(url[0]?.text).toBe("https://dockets.example.com/case/04567");
  });

  it("keeps a birth date and leaves a filing date", async () => {
    const dob = await scrub("Plaintiff was born on March 14, 1985. DOB: 03/14/1985.");
    expect(dob.text).not.toContain("March 14, 1985");
    expect(dob.text).not.toContain("03/14/1985");
    expect(dob.findings.filter((item) => item.entityType === "DATE_OF_BIRTH")).toHaveLength(2);

    const filed = await scrub("The complaint was filed on 03/14/2024. Hearing date is May 14, 2024.");
    expect(filed.text).toContain("03/14/2024");
    expect(filed.text).toContain("May 14, 2024");
    expect(filed.findings.filter((item) => item.entityType === "DATE_OF_BIRTH")).toHaveLength(0);
  });

  it("reads common phone forms and ignores a short number", async () => {
    const phones = await scrub("Call (415) 555-0134 or 415-555-0134 or +44 20 7946 0958.");
    expect(phones.text).not.toContain("555-0134");
    expect(phones.text).not.toContain("7946");
    expect(phones.findings.filter((item) => item.entityType === "PHONE_NUMBER").length).toBeGreaterThanOrEqual(3);

    const bare = await scrub("Reference 4155550199 in the index.");
    expect(bare.text).toContain("4155550199");
    expect(bare.residual.some((item) => item.entityType === "PHONE_NUMBER")).toBe(true);

    const cued = await scrub("Please call 4155550199 tomorrow.");
    expect(cued.text).not.toContain("4155550199");
  });

  it("reads a street address and a PO box", async () => {
    const street = await scrub("Lives at 400 Paper Street, Faketown, CA 90210.");
    expect(street.text).not.toContain("Paper Street");
    expect(street.text).toContain("[ADDRESS_1]");

    const apt = await scrub("Lives at 400 Paper Street, Apt 4, Faketown, CA 90210.");
    expect(apt.text).not.toContain("Apt 4");

    const box = await scrub("Mail to P.O. Box 12, Faketown, CA 90210.");
    expect(box.text).not.toContain("Box 12");
  });

  it("needs a passport or license cue, and ignores Exhibit A1", async () => {
    const passport = await scrub("Passport A12345678 was copied.");
    expect(passport.text).not.toContain("A12345678");
    expect(passport.findings[0]?.recognizer).toBe("us-passport");

    const license = await scrub("driver license D1234567");
    expect(license.text).toContain("[DL_1]");

    const exhibit = await scrub("See Exhibit A1.");
    expect(exhibit.text).toContain("Exhibit A1");
    expect(exhibit.residual).toEqual([]);

    const separated = await scrub("driver license D1234567.\nPassport A12345678 is attached.");
    const byText = Object.fromEntries(separated.findings.map((item) => [item.text, item.recognizer]));
    expect(byText["D1234567"]).toBe("us-driver-license");
    expect(byText["A12345678"]).toBe("us-passport");

    const bare = await scrub("Code A12345678 is printed on the tab.");
    expect(bare.text).toContain("A12345678");
    expect(bare.residual.some((item) => item.recognizer === "us-driver-license")).toBe(true);
  });

  it("does not treat the word must as a passport cue", async () => {
    const found = await analyze("You must file 140190333 copies.", { threshold: 0.4 });
    expect(found.filter((item) => item.entityType === "US_PASSPORT")).toHaveLength(0);
  });
});
