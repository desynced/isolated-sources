export const BOOKMARKLET_CAVEAT =
  "This runs on other websites. Isolated Sources' security policy and airplane-mode self-test do not apply there. It does not send the text to a server.";

const ORIGIN = /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i;

/**
 * Extensionless on purpose. html_handling auto-trailing-slash answers
 * `/scrub-selection.html` with a 307 to `/scrub-selection`, and that redirect
 * can drop the hash or sever window.opener.
 */
export const SCRUB_SELECTION_HASH = "/scrub-selection#";

export function buildBookmarklet(origin: string): string {
  if (!ORIGIN.test(origin)) throw new Error("The bookmarklet needs an http(s) origin.");
  const site = JSON.stringify(origin);
  const page = JSON.stringify(`${origin}${SCRUB_SELECTION_HASH}`);
  const note = JSON.stringify(BOOKMARKLET_CAVEAT);
  const body = `(function(){var note=${note};var text="";try{text=String(window.getSelection?window.getSelection():"");}catch(e){text="";}if(!text){alert("Select text first. "+note);return;}var token=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);var win=window.open(${page}+token);if(!win){alert("Allow the new tab, then try again. "+note);return;}var n=0;function onMsg(e){if(e.origin!==${site})return;var data=e.data||{};if(data.isolatedSources!==token||data.ok!==true)return;clearInterval(timer);window.removeEventListener("message",onMsg);}var timer=setInterval(function(){n+=1;try{win.postMessage({isolatedSources:token,text:text},${site});}catch(e){}if(n>40){clearInterval(timer);window.removeEventListener("message",onMsg);}},150);window.addEventListener("message",onMsg);})();`;
  return `javascript:${body}`;
}

export function acceptSelection(
  source: unknown,
  opener: unknown,
  token: string,
  data: unknown,
): { ok: true; text: string } | { ok: false } {
  if (!token || opener == null || source !== opener) return { ok: false };
  if (!data || typeof data !== "object") return { ok: false };
  const record = data as { isolatedSources?: unknown; text?: unknown };
  if (record.isolatedSources !== token || typeof record.text !== "string") return { ok: false };
  if (record.text.trim() === "") return { ok: false };
  return { ok: true, text: record.text };
}

export function selectionStatus(count: number): string {
  const spans = count === 1 ? "span" : "spans";
  return `Scrubbed ${count} ${spans}. You must review before you share this.`;
}

/** A saved bookmarklet still opens /bookmarklet.html#token. A bare visit stays on the install page. */
export function installHiddenForHash(hash: string): boolean {
  return hash.replace(/^#/, "").length > 0;
}

/** The result page accepts a handoff only when the bookmarklet opened it and passed a token. */
export function canReceiveSelection(token: string, opener: unknown): boolean {
  return token.length > 0 && opener != null;
}

/** Reply once to the opener, and return the selection when the handoff matches. */
export function takeSelection(event: MessageEvent, token: string): string | null {
  const accepted = acceptSelection(event.source, window.opener, token, event.data);
  if (!accepted.ok) return null;
  const reply = { isolatedSources: token, ok: true as const };
  if (event.source && "focus" in event.source) {
    event.source.postMessage(reply, event.origin);
  }
  return accepted.text;
}
