export interface CompareFinding {
  start: number;
  end: number;
  placeholder: string;
  text: string;
}

export interface OriginalPiece {
  kind: "text" | "hit";
  text: string;
  placeholder?: string;
  index?: number;
}

/** Original text split so each replacement lines up with one placeholder. */
export function originalPieces(source: string, findings: readonly CompareFinding[]): OriginalPiece[] {
  const sorted = [...findings].sort((a, b) => a.start - b.start || a.end - b.end);
  const pieces: OriginalPiece[] = [];
  let cursor = 0;
  let index = 0;
  for (const finding of sorted) {
    if (finding.start < cursor || finding.end < finding.start || finding.end > source.length) continue;
    if (finding.start > cursor) {
      pieces.push({ kind: "text", text: source.slice(cursor, finding.start) });
    }
    pieces.push({
      kind: "hit",
      text: source.slice(finding.start, finding.end),
      placeholder: finding.placeholder,
      index,
    });
    index += 1;
    cursor = finding.end;
  }
  if (cursor < source.length) pieces.push({ kind: "text", text: source.slice(cursor) });
  return pieces;
}
