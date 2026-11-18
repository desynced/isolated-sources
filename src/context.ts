const WORD = /[A-Za-z0-9#]+/g;

export interface ContextView {
  tokens: string[];
  /** Lowercased text covering the context tokens, possibly including the match. */
  phraseWindow: string;
}

/**
 * Keep cues inside the same sentence. A period counts only when it ends a
 * sentence ("license. Passport"), so "No." and "d.o.b." stay attached.
 */
function sentenceRegion(text: string, start: number, end: number): { from: number; to: number } {
  const before = text.slice(0, start);
  let from = 0;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const char = before[i] ?? "";
    if (char === "\n" || char === "?" || char === "!") {
      from = i + 1;
      break;
    }
    if (char === ".") {
      const rest = before.slice(i + 1);
      if (/^\s+[A-Z]/.test(rest) || /^\s*$/.test(rest)) {
        from = i + 1;
        break;
      }
    }
  }

  const after = text.slice(end);
  const boundary = /[?!\n]|\.(?=\s+[A-Z]|\s*$)/.exec(after);
  const to = boundary?.index == null ? text.length : end + boundary.index;
  return { from, to };
}

/**
 * Tokens around a match. The match itself is not a context token.
 * Phrase checks use the raw slice so "date of birth" and "d.o.b." still hit.
 */
export function contextWindow(
  text: string,
  start: number,
  end: number,
  prefixCount: number,
  suffixCount: number,
): ContextView {
  const region = sentenceRegion(text, start, end);
  const words: { text: string; start: number; end: number }[] = [];
  for (const match of text.matchAll(WORD)) {
    const index = match.index ?? 0;
    const wordEnd = index + match[0].length;
    if (wordEnd <= region.from || index >= region.to) continue;
    words.push({ text: match[0], start: index, end: wordEnd });
  }

  const entity = words.findIndex((word) => word.start < end && word.end > start);
  const beforeTo = entity >= 0 ? entity : Math.max(0, words.findIndex((word) => word.start >= start));
  const safeBeforeTo = beforeTo < 0 ? words.length : beforeTo;
  const beforeFrom = Math.max(0, safeBeforeTo - prefixCount);

  let afterStart = words.findIndex((word) => word.start >= end);
  if (afterStart < 0) afterStart = words.length;
  const afterTo = Math.min(words.length, afterStart + suffixCount);

  const selected = [...words.slice(beforeFrom, safeBeforeTo), ...words.slice(afterStart, afterTo)];
  const tokens = selected.map((word) => word.text.toLowerCase());
  if (selected.length === 0) return { tokens, phraseWindow: "" };
  const phraseWindow = text
    .slice(selected[0].start, selected[selected.length - 1].end)
    .toLowerCase();
  return { tokens, phraseWindow };
}

/**
 * Presidio-style context hit.
 * Short words (length <= 3) must match a whole token. Longer words match
 * as substrings, which is how Presidio's default enhancer treats "license".
 * Phrases and dotted forms ("date of birth", "d.o.b") are sought in the window.
 */
export function supportiveContext(
  tokens: readonly string[],
  phraseWindow: string,
  context: readonly string[] | undefined,
): string | undefined {
  if (!context || context.length === 0) return undefined;
  for (const raw of context) {
    const word = raw.toLowerCase().trim();
    if (!word) continue;
    if (word.includes(" ") || word.includes(".")) {
      if (phraseWindow.includes(word)) return raw;
      continue;
    }
    const hit =
      word.length <= 3
        ? tokens.some((token) => token === word)
        : tokens.some((token) => token.includes(word));
    if (hit) return raw;
  }
  return undefined;
}
