import { receiveSelection, selectionStatus } from "./bookmarklet.js";
import { runScrub } from "./review.js";
import "./styles.css";

const token = location.hash.replace(/^#/, "");
const empty = document.getElementById("scrub-empty");
const waiting = document.getElementById("scrub-waiting");
const output = document.getElementById("scrub-output");
const result = document.getElementById("scrub-result");
const openedByBookmarklet = token.length > 0 && window.opener != null;

if (empty) empty.hidden = openedByBookmarklet;
if (waiting) waiting.hidden = !openedByBookmarklet;

if (openedByBookmarklet) {
  receiveSelection(token, (text) => {
    void show(text);
  });
}

async function show(text: string): Promise<void> {
  if (waiting) waiting.hidden = true;
  if (empty) empty.hidden = true;
  if (result) result.hidden = false;
  const state = await runScrub(text, []);
  if (output) output.textContent = state.scrubbed;
  const status = document.getElementById("scrub-status");
  if (status) status.textContent = selectionStatus(state.findings.length);
}

document.getElementById("scrub-copy")?.addEventListener("click", () => {
  const text = output?.textContent ?? "";
  void navigator.clipboard?.writeText(text);
});
