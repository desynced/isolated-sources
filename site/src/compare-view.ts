import { originalPieces, type CompareFinding } from "./compare.js";

export function renderCompare(
  doc: Document,
  originalHost: HTMLElement,
  scrubbedHost: HTMLElement,
  source: string,
  findings: readonly CompareFinding[],
): void {
  originalHost.replaceChildren();
  scrubbedHost.replaceChildren();
  const pieces = originalPieces(source, findings);
  const hits = pieces.filter((piece) => piece.kind === "hit");
  if (hits.length === 0) {
    const note = doc.createElement("p");
    note.className = "hint";
    note.textContent = "Nothing was replaced, so the two sides match.";
    originalHost.append(note);
  }
  for (const piece of pieces) {
    if (piece.kind === "text") {
      originalHost.append(doc.createTextNode(piece.text));
      scrubbedHost.append(doc.createTextNode(piece.text));
      continue;
    }
    const index = piece.index ?? 0;
    const placeholder = piece.placeholder ?? "";
    const orig = doc.createElement("mark");
    orig.className = "replaced";
    const origLink = doc.createElement("a");
    origLink.id = `compare-orig-${index}`;
    origLink.href = `#compare-scrub-${index}`;
    origLink.setAttribute("aria-label", `${piece.text}, replaced with ${placeholder}. Show placeholder.`);
    const shown = doc.createElement("span");
    shown.className = "jump";
    shown.setAttribute("aria-hidden", "true");
    shown.textContent = placeholder;
    origLink.append(doc.createTextNode(piece.text), doc.createTextNode(" "), shown);
    orig.append(origLink);
    originalHost.append(orig);

    const scrub = doc.createElement("mark");
    scrub.className = "placeholder";
    const scrubLink = doc.createElement("a");
    scrubLink.id = `compare-scrub-${index}`;
    scrubLink.href = `#compare-orig-${index}`;
    scrubLink.textContent = placeholder;
    scrubLink.setAttribute("aria-label", `${placeholder}, replaced ${piece.text}. Show original.`);
    scrub.append(scrubLink);
    scrubbedHost.append(scrub);
  }
}

export function focusCompareLink(doc: Document, link: HTMLAnchorElement): boolean {
  const id = link.getAttribute("href")?.replace(/^#/, "") ?? "";
  if (!id) return false;
  const dest = doc.getElementById(id);
  if (!(dest instanceof HTMLElement)) return false;
  dest.focus();
  if (typeof dest.scrollIntoView === "function") {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    dest.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }
  return true;
}
