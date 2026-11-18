import { describe, expect, it } from "vitest";
import { restore, scrub } from "../src/index.js";

const MEMO = `IN THE CIRCUIT COURT OF EXAMPLE COUNTY

Alex Rivera,
    Plaintiff,
v.
Jordan Quinn,
    Defendant.

Case No. 1:24-cv-04567
Docket No. 1:24-cv-04567
Matter No. 24-1188

Plaintiff Alex Rivera states:

1. Plaintiff resides at 400 Paper Street, Faketown, CA 90210.
2. Plaintiff was born on March 14, 1985. DOB: 03/14/1985.
3. The complaint was filed on 03/14/2024.
4. Defendant Jordan Quinn may be reached at jordan.quinn@example.com or (415) 555-0134.
5. Ms. Rivera produced records. Mr. Quinn provided SSN 219-09-9999 and driver license D1234567.
6. Passport A12345678 was attached as Exhibit B.
7. Payment card 4111-1111-1111-1111 was charged in error.
8. Wire instructions listed IBAN DE89370400440532013000.
9. Server logs show 203.0.113.10 and https://dockets.example.com/case/04567.
10. Bates ABC-000100 through ABC-000120 were produced.
11. Judge Harper Quinn denied the motion to dismiss.
12. See also Rivera v. Quinn, the earlier filing.
13. Associate Pat Exampleton appeared for the defense.

Respectfully submitted.`;

const SECRETS = [
  "Alex Rivera",
  "Jordan Quinn",
  "Harper Quinn",
  "Ms. Rivera",
  "Mr. Quinn",
  "1:24-cv-04567",
  "24-1188",
  "400 Paper Street",
  "Faketown",
  "90210",
  "March 14, 1985",
  "03/14/1985",
  "jordan.quinn@example.com",
  "555-0134",
  "219-09-9999",
  "D1234567",
  "A12345678",
  "4111-1111-1111-1111",
  "DE89370400440532013000",
  "203.0.113.10",
  "dockets.example.com",
  "ABC-000100",
  "ABC-000120",
];

describe("synthetic legal memo", () => {
  it("replaces identifiers, keeps the filing date and an uncued name, and round-trips", async () => {
    const result = await scrub(MEMO, { knownParties: ["Alex Rivera", "Jordan Quinn"] });

    for (const secret of SECRETS) {
      expect(result.text, secret).not.toContain(secret);
    }
    expect(result.text).toContain("03/14/2024");
    expect(result.text).toContain("Pat Exampleton");
    expect(result.text).toContain("EXAMPLE COUNTY");
    expect(result.text).toContain("motion to dismiss");
    expect(result.text).toContain("Exhibit B");
    expect(result.text).toContain("CIRCUIT COURT");
    expect(result.residual).toEqual([]);

    const alex = Object.entries(result.mapping).filter(([, value]) => value === "Alex Rivera");
    expect(alex).toHaveLength(1);
    expect(result.text.split(alex[0]?.[0] ?? "\n").length - 1).toBeGreaterThan(1);

    const caseToken = Object.entries(result.mapping).find(([, value]) => value === "1:24-cv-04567")?.[0];
    expect(caseToken).toBe("[CASE_1]");
    expect(result.text).toContain(`Case No. ${caseToken}`);
    expect(result.text).toContain(`Docket No. ${caseToken}`);

    expect(result.findings.every((item) => item.recognizer && item.contextSnippet.includes(item.text))).toBe(true);
    expect(result.findings.find((item) => item.text === "A12345678")?.recognizer).toBe("us-passport");

    const back = restore(result.text, result.mapping);
    expect(back.missing).toEqual([]);
    expect(back.altered).toEqual([]);
    expect(back.text).toBe(MEMO);

    const edited = result.text.replace("denied the motion to dismiss", "granted the motion");
    const rewritten = restore(edited, result.mapping);
    expect(rewritten.missing).toEqual([]);
    expect(rewritten.text).toContain("granted the motion");
    expect(rewritten.text).toContain("Harper Quinn");
  });
});
