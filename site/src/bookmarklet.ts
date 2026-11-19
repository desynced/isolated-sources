export const BOOKMARKLET_CAVEAT =
  "This runs on other websites. Isolated Sources' security policy and airplane-mode self-test do not apply there. It does not send the text to a server.";

const ORIGIN = /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i;

export function buildBookmarklet(origin: string): string {
  if (!ORIGIN.test(origin)) throw new Error("The bookmarklet needs an http(s) origin.");
  const site = JSON.stringify(origin);
  const page = JSON.stringify(`${origin}/bookmarklet.html#`);
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
