/**
 * A short legal excerpt for the "Try a sample" path.
 * One scrub, a review, and a restore of an answer that drops one placeholder
 * and lowercases another. That is enough to show the missing-placeholder report.
 */

export const SAMPLE_TEXT = `Jordan Quinn emailed jordan.quinn@example.com about the draft.

Alex Rivera,
    Plaintiff,
v.
Jordan Quinn,
    Defendant.

Judge Mina Cho denied the motion in Rivera v. Quinn.
Docket No. 1:24-cv-04567. Case No. 1:24-cv-04567.
Matter No. 24-1188. Bates ABC-000100 is the first page.`;

export const SAMPLE_PARTIES = "Jordan Quinn\nAlex Rivera";

export interface SampleAnswer {
  answer: string;
  dropped: string;
  altered: string;
}

/**
 * Build an answer that omits one exact placeholder and lowercases another.
 * Lowercase still looks like a placeholder, so restore reports it as altered
 * and does not guess the original text.
 */
export function buildSampleAnswer(scrubbed: string, mapping: Record<string, string>): SampleAnswer | null {
  const keys = Object.keys(mapping).sort();
  const dropped = keys[0];
  const source = keys[1];
  if (!dropped || !source) return null;
  const altered = source.toLowerCase();
  if (altered === source || Object.prototype.hasOwnProperty.call(mapping, altered)) return null;
  const answer = scrubbed.replaceAll(dropped, "").replaceAll(source, altered);
  if (answer.includes(dropped) || answer.includes(source) || !answer.includes(altered)) return null;
  return { answer, dropped, altered };
}
