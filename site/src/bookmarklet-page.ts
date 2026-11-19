import {
  BOOKMARKLET_CAVEAT,
  buildBookmarklet,
  installHiddenForHash,
  selectionStatus,
  takeSelection,
} from "./bookmarklet.js";
import { runScrub } from "./review.js";
import "./styles.css";

const caveat = document.getElementById("bookmarklet-caveat");
if (caveat) caveat.textContent = BOOKMARKLET_CAVEAT;

const link = document.getElementById("bookmarklet-link");
const source = document.getElementById("bookmarklet-source");
const token = location.hash.replace(/^#/, "");
const install = document.getElementById("bookmarklet-install");
const waiting = document.getElementById("bookmarklet-waiting");
const output = document.getElementById("bookmarklet-output");
const result = document.getElementById("bookmarklet-result");
const legacy = installHiddenForHash(location.hash);

if (legacy) {
  if (install) install.hidden = true;
  if (waiting) waiting.hidden = false;
} else {
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
}

let taken = false;
window.addEventListener("message", (event) => {
  if (taken) return;
  const text = takeSelection(event, token);
  if (text == null) return;
  taken = true;
  void show(text);
});

async function show(text: string): Promise<void> {
  if (install) install.hidden = true;
  if (waiting) waiting.hidden = true;
  if (result) result.hidden = false;
  const state = await runScrub(text, []);
  if (output) output.textContent = state.scrubbed;
  const status = document.getElementById("bookmarklet-status");
  if (status) status.textContent = selectionStatus(state.findings.length);
}

document.getElementById("bookmarklet-copy")?.addEventListener("click", () => {
  const text = output?.textContent ?? "";
  void navigator.clipboard?.writeText(text);
});
