import { acceptSelection, BOOKMARKLET_CAVEAT, buildBookmarklet } from "./bookmarklet.js";
import { runScrub } from "./review.js";
import "./styles.css";

const caveat = document.getElementById("bookmarklet-caveat");
if (caveat) caveat.textContent = BOOKMARKLET_CAVEAT;

const link = document.getElementById("bookmarklet-link");
const source = document.getElementById("bookmarklet-source");
let href = "";
try {
  href = buildBookmarklet(location.origin);
} catch {
  href = "";
}
if (link instanceof HTMLAnchorElement && href) {
  link.href = href;
  link.textContent = "Scrub selection";
}
if (source) source.textContent = href || "Open this page on the site to get the bookmarklet.";

const token = location.hash.replace(/^#/, "");
const waiting = document.getElementById("bookmarklet-waiting");
const output = document.getElementById("bookmarklet-output");
const result = document.getElementById("bookmarklet-result");
if (token && waiting) waiting.hidden = false;

let taken = false;
window.addEventListener("message", (event) => {
  if (taken) return;
  const accepted = acceptSelection(event.source, window.opener, token, event.data);
  if (!accepted.ok) return;
  taken = true;
  const reply = { isolatedSources: token, ok: true as const };
  if (event.source && "focus" in event.source) {
    event.source.postMessage(reply, event.origin);
  }
  void show(accepted.text);
});

async function show(text: string): Promise<void> {
  if (waiting) waiting.hidden = true;
  if (result) result.hidden = false;
  const state = await runScrub(text, []);
  if (output) output.textContent = state.scrubbed;
  const status = document.getElementById("bookmarklet-status");
  if (status) {
    const count = state.findings.length;
    status.textContent = `Scrubbed ${count} span${count === 1 ? "" : "s"}. You must review before you share this.`;
  }
}

document.getElementById("bookmarklet-copy")?.addEventListener("click", () => {
  const text = output?.textContent ?? "";
  void navigator.clipboard?.writeText(text);
});
