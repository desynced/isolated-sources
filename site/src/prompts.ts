export interface PromptStarter {
  id: string;
  title: string;
  text: string;
}

/**
 * Paste above the scrubbed text. Placeholders must survive unchanged:
 * no rewording, no case changes, no dropped tokens.
 */
export const PROMPT_GENERAL = [
  "The text below was scrubbed. Placeholders such as [DOCKET_1] and [PERSON_1] stand in for details that were removed.",
  "Keep every placeholder exactly as written. Do not reword a placeholder, change its case, add or remove brackets, or drop one.",
  "Do not guess what a placeholder stood for.",
].join(" ");

export const PROMPT_LEGAL = [
  "Draft from the scrubbed text below. Placeholders such as [DOCKET_1], [CASE_1], [PERSON_1], and [MATTER_1] are exact stand-ins.",
  "Keep every placeholder exactly as written. Do not reword a placeholder, change its case, add or remove brackets, or drop one.",
  "Do not invent the underlying names, numbers, or facts. You must review the draft before you rely on it.",
].join(" ");

export const PROMPT_STARTERS: readonly PromptStarter[] = [
  { id: "general", title: "General", text: PROMPT_GENERAL },
  { id: "legal", title: "Legal drafting", text: PROMPT_LEGAL },
];
