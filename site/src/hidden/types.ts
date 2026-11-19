export interface HiddenWarning {
  kind: string;
  detail: string;
}

export interface HiddenReport {
  warnings: HiddenWarning[];
  notes: string[];
}

export const HIDDEN_NOTE =
  "This is a best-effort check. It can miss hidden text, and it does not change the file. You must review before you rely on it.";
