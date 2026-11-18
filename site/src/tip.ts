const HTTPS = /^https:\/\/[^\s]+$/;

/** Show the tip link only for a non-empty https URL. */
export function applyTipLink(anchor: HTMLAnchorElement, item: HTMLElement, url: string): void {
  const trimmed = url.trim();
  if (!HTTPS.test(trimmed)) {
    anchor.removeAttribute("href");
    item.hidden = true;
    return;
  }
  anchor.href = trimmed;
  item.hidden = false;
}
