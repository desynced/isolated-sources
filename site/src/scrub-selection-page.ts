import { canReceiveSelection, selectionStatus, takeSelection } from "./bookmarklet.js";
import { runScrub } from "./review.js";
import "./styles.css";

const token = location.hash.replace(/^#/, "");
const direct = document.getElementById("scrub-direct");
const waiting = document.getElementById("scrub-waiting");
const output = document.getElementById("scrub-output");
const result = document.getElementById("scrub-result");
const ready = canReceiveSelection(token, window.opener);

if (ready) {
  if (waiting) waiting.hidden = false;
} else if (direct) {
  direct.hidden = false;
}

let taken = false;
window.addEventListener("message", (event) => {
  if (taken || !ready) return;
  const text = takeSelection(event, token);
  if (text == null) return;
  taken = true;
  void show(text);
});

async function show(text: string): Promise<void> {
  if (direct) direct.hidden = true;
  if (waiting) waiting.hidden = true;
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
