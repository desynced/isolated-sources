import { restore, type Finding, type ResidualFinding, type RestoreResult } from "../../src/index.js";
import { focusCompareLink, renderCompare } from "./compare-view.js";
import { downloadBytes } from "./download.js";
import { PAGE_TITLE } from "./meta.js";
import { PROMPT_STARTERS } from "./prompts.js";
import { buildReceipt, receiptArchive } from "./receipt.js";
import { SAMPLE_PARTIES, SAMPLE_TEXT, buildSampleAnswer } from "./sample.js";
import { runSelfTest, selfTestMessage } from "./self-test.js";
import {
  addResidual,
  addSpan,
  KINDS,
  parseParties,
  runScrub,
  unflag,
  type ScrubState,
} from "./review.js";

type Step = "paste" | "review" | "restore";

interface PendingRange {
  start: number;
  end: number;
}

type ViewRead = PendingRange | { message: string } | null;

export function mount(doc: Document): void {
  const required = <T extends HTMLElement>(id: string): T => {
    const el = doc.getElementById(id);
    if (!(el instanceof HTMLElement)) throw new Error(`Missing #${id}`);
    return el as T;
  };

  const status = required<HTMLElement>("status");
  const pasteStep = required<HTMLElement>("step-paste");
  const reviewStep = required<HTMLElement>("step-review");
  const restoreStep = required<HTMLElement>("step-restore");
  const pasteForm = required<HTMLFormElement>("paste-form");
  const source = required<HTMLTextAreaElement>("source-text");
  const parties = required<HTMLTextAreaElement>("known-parties");
  const pasteError = required<HTMLElement>("paste-error");
  const scrubButton = required<HTMLButtonElement>("scrub-button");
  const scrubbedHeading = required<HTMLElement>("scrubbed-heading");
  const scrubbedView = required<HTMLElement>("scrubbed-view");
  const comparePanel = required<HTMLElement>("compare-panel");
  const originalView = required<HTMLElement>("original-view");
  const compareScrubbed = required<HTMLElement>("compare-scrubbed-view");
  const viewScrubbed = required<HTMLButtonElement>("view-scrubbed");
  const viewCompare = required<HTMLButtonElement>("view-compare");
  const promptHost = required<HTMLElement>("prompt-starters");
  const findingsSummary = required<HTMLElement>("findings-summary");
  const findingsEmpty = required<HTMLElement>("findings-empty");
  const findings = required<HTMLElement>("findings");
  const residual = required<HTMLElement>("residual");
  const missed = required<HTMLTextAreaElement>("missed-source");
  const flagKind = required<HTMLSelectElement>("flag-kind");
  const flagButton = required<HTMLButtonElement>("flag-selection");
  const flagError = required<HTMLElement>("flag-error");
  const restoreForm = required<HTMLFormElement>("restore-form");
  const aiAnswer = required<HTMLTextAreaElement>("ai-answer");
  const restoreError = required<HTMLElement>("restore-error");
  const restoreResult = required<HTMLElement>("restore-result");
  const restoredView = required<HTMLElement>("restored-view");
  const restoreSummary = required<HTMLElement>("restore-summary");
  const missingSection = required<HTMLElement>("missing-section");
  const missingLead = required<HTMLElement>("missing-lead");
  const missingList = required<HTMLElement>("missing-list");
  const alteredSection = required<HTMLElement>("altered-section");
  const alteredLead = required<HTMLElement>("altered-lead");
  const alteredList = required<HTMLElement>("altered-list");
  const clearButton = required<HTMLButtonElement>("clear-session");
  const trySampleButton = required<HTMLButtonElement>("try-sample");
  const sampleNote = required<HTMLElement>("sample-note");
  const selfTestButton = required<HTMLButtonElement>("self-test-button");
  const selfTestResult = required<HTMLElement>("self-test-result");

  let state: ScrubState | null = null;
  let pending: PendingRange | null = null;
  let sampleOn = false;
  let stagedAnswer = "";
  let compareOn = false;

  const setSession = (next: ScrubState | null): void => {
    state = next;
    clearButton.hidden = next === null;
  };

  const syncSample = (): void => {
    if (!sampleOn || !state) {
      stagedAnswer = "";
      sampleNote.hidden = true;
      sampleNote.textContent = "";
      return;
    }
    const built = buildSampleAnswer(state.scrubbed, state.mapping);
    if (!built) {
      stagedAnswer = "";
      sampleNote.hidden = false;
      sampleNote.textContent =
        "This sample needs two placeholders before the sample answer can drop one and alter another.";
      return;
    }
    stagedAnswer = built.answer;
    sampleNote.hidden = false;
    sampleNote.textContent =
      "Sample loaded. Continue to restore fills a sample answer that drops one placeholder and alters another. You must review before you rely on it.";
  };

  setSession(null);

  for (const starter of PROMPT_STARTERS) {
    const article = doc.createElement("article");
    article.className = "prompt";
    const title = doc.createElement("h4");
    title.id = `prompt-title-${starter.id}`;
    title.textContent = starter.title;
    const pre = doc.createElement("pre");
    pre.id = `prompt-text-${starter.id}`;
    pre.className = "text-out prompt-text";
    pre.textContent = starter.text;
    const copy = doc.createElement("button");
    copy.type = "button";
    copy.className = "secondary";
    copy.dataset.action = "copy-prompt";
    copy.dataset.prompt = starter.id;
    copy.textContent = `Copy ${starter.title.toLowerCase()} prompt`;
    article.append(title, pre, copy);
    promptHost.append(article);
  }

  for (const kind of KINDS) {
    const option = doc.createElement("option");
    option.value = kind.value;
    option.textContent = kind.label;
    flagKind.append(option);
  }

  const announce = (message: string): void => {
    status.textContent = message;
  };

  const focusHeading = (id: string): void => {
    const el = doc.getElementById(id);
    if (!(el instanceof HTMLElement)) return;
    el.tabIndex = -1;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
    el.focus({ preventScroll: true });
  };

  const showStep = (step: Step): void => {
    pasteStep.hidden = step !== "paste";
    reviewStep.hidden = step !== "review";
    restoreStep.hidden = step !== "restore";
    const titles: Record<Step, string> = {
      paste: PAGE_TITLE,
      review: "Review — Isolated Sources",
      restore: "Restore — Isolated Sources",
    };
    doc.title = titles[step];
    for (const [id, name] of [
      ["progress-paste", "paste"],
      ["progress-review", "review"],
      ["progress-restore", "restore"],
    ] as const) {
      const item = doc.getElementById(id);
      if (!item) continue;
      if (name === step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
  };

  const renderScrubbed = (): void => {
    scrubbedView.replaceChildren();
    if (!state) return;
    const sorted = [...state.findings].sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = 0;
    const pushLiteral = (from: number, to: number): void => {
      if (to <= from) return;
      const span = doc.createElement("span");
      span.dataset.originStart = String(from);
      span.dataset.originEnd = String(to);
      span.textContent = state?.source.slice(from, to) ?? "";
      scrubbedView.append(span);
    };
    for (const finding of sorted) {
      pushLiteral(cursor, finding.start);
      const mark = doc.createElement("mark");
      mark.className = "placeholder";
      mark.dataset.placeholder = finding.placeholder;
      mark.textContent = finding.placeholder;
      scrubbedView.append(mark);
      cursor = finding.end;
    }
    pushLiteral(cursor, state.source.length);
  };

  const contextWhy = (finding: Finding): string => {
    if (finding.recognizer === "you") return "You selected this text.";
    if (finding.contextWord) return `The word "${finding.contextWord}" raised the score.`;
    return "No nearby context word raised the score.";
  };

  const renderFindings = (): void => {
    findings.replaceChildren();
    if (!state) return;
    const count = state.findings.length;
    const placeholders = Object.keys(state.mapping).length;
    findingsSummary.textContent =
      count === 0
        ? "No spans were replaced."
        : `Replaced ${count} span${count === 1 ? "" : "s"} with ${placeholders} placeholder${placeholders === 1 ? "" : "s"}.`;
    findingsEmpty.hidden = count !== 0;
    findings.hidden = count === 0;
    for (const finding of state.findings) {
      const item = doc.createElement("li");
      item.className = "finding";
      item.dataset.start = String(finding.start);
      item.dataset.end = String(finding.end);
      item.dataset.placeholder = finding.placeholder;

      const top = doc.createElement("div");
      top.className = "finding-top";
      const title = doc.createElement("p");
      title.className = "finding-title";
      const mark = doc.createElement("mark");
      mark.className = "placeholder";
      mark.textContent = finding.placeholder;
      const surface = doc.createElement("span");
      surface.className = "surface";
      surface.textContent = finding.text;
      title.append(mark, doc.createTextNode(" "), surface);

      const button = doc.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.action = "unflag";
      button.dataset.start = String(finding.start);
      button.dataset.end = String(finding.end);
      button.textContent = "Un-flag";
      button.setAttribute("aria-label", `Un-flag ${finding.placeholder}, ${finding.text}`);
      top.append(title, button);

      const meta = doc.createElement("dl");
      meta.className = "meta";
      const recognizer = finding.pattern ? `${finding.recognizer} (${finding.pattern})` : finding.recognizer;
      const rows: [string, string, string?][] = [
        ["Recognizer", recognizer, "recognizer"],
        ["Score", finding.score.toFixed(2), "score"],
      ];
      for (const [term, value, field] of rows) {
        const dt = doc.createElement("dt");
        dt.textContent = term;
        const dd = doc.createElement("dd");
        dd.textContent = value;
        if (field) dd.dataset.field = field;
        meta.append(dt, dd);
      }
      const contextTerm = doc.createElement("dt");
      contextTerm.textContent = "Context";
      const context = doc.createElement("dd");
      context.dataset.field = "context";
      const why = doc.createElement("p");
      why.textContent = contextWhy(finding);
      const snippet = doc.createElement("p");
      snippet.className = "snippet";
      snippet.dataset.field = "snippet";
      snippet.textContent = finding.contextSnippet;
      context.append(why, snippet);
      meta.append(contextTerm, context);
      item.append(top, meta);
      findings.append(item);
    }
  };

  const renderResidual = (): void => {
    residual.replaceChildren();
    const heading = doc.createElement("h3");
    heading.id = "residual-heading";
    heading.textContent = "Fail-safe re-scan";
    const lead = doc.createElement("p");
    const items = state?.residual ?? [];
    lead.textContent =
      items.length === 0
        ? "Fail-safe re-scan found no other spans that look like identifiers."
        : "Fail-safe re-scan still sees these spans in the scrubbed text. They were not replaced.";
    residual.append(heading, lead);
    if (items.length === 0) return;
    const list = doc.createElement("ul");
    list.className = "finding-list";
    for (const item of items) {
      list.append(renderResidualItem(item));
    }
    residual.append(list);
  };

  const renderResidualItem = (item: ResidualFinding): HTMLLIElement => {
    const li = doc.createElement("li");
    li.className = "residual-item";
    const top = doc.createElement("div");
    top.className = "residual-top";
    const title = doc.createElement("p");
    title.className = "residual-title";
    const surface = doc.createElement("span");
    surface.className = "surface";
    surface.textContent = item.text;
    title.append(surface);
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.dataset.action = "flag-residual";
    button.dataset.start = String(item.start);
    button.dataset.end = String(item.end);
    button.textContent = "Flag this";
    button.setAttribute("aria-label", `Flag ${item.text}`);
    top.append(title, button);
    const meta = doc.createElement("dl");
    meta.className = "meta";
    const recognizer = item.pattern ? `${item.recognizer} (${item.pattern})` : item.recognizer;
    const pairs: [string, string][] = [
      ["Recognizer", recognizer],
      ["Score", item.score.toFixed(2)],
    ];
    for (const [term, value] of pairs) {
      const dt = doc.createElement("dt");
      dt.textContent = term;
      const dd = doc.createElement("dd");
      dd.textContent = value;
      meta.append(dt, dd);
    }
    const contextTerm = doc.createElement("dt");
    contextTerm.textContent = "Context";
    const context = doc.createElement("dd");
    const why = doc.createElement("p");
    why.textContent = item.contextWord
      ? `The word "${item.contextWord}" raised the score.`
      : "No nearby context word raised the score.";
    const snippet = doc.createElement("p");
    snippet.className = "snippet";
    snippet.textContent = item.contextSnippet;
    context.append(why, snippet);
    meta.append(contextTerm, context);
    li.append(top, meta);
    return li;
  };

  const renderCompareView = (): void => {
    if (!state) {
      originalView.replaceChildren();
      compareScrubbed.replaceChildren();
      return;
    }
    renderCompare(doc, originalView, compareScrubbed, state.source, state.findings);
  };

  const setCompare = (on: boolean): void => {
    compareOn = on;
    comparePanel.hidden = !on;
    scrubbedView.hidden = on;
    viewScrubbed.setAttribute("aria-pressed", on ? "false" : "true");
    viewCompare.setAttribute("aria-pressed", on ? "true" : "false");
    scrubbedHeading.textContent = on ? "Original and scrubbed text" : "Scrubbed text";
  };

  const renderReview = (): void => {
    renderScrubbed();
    renderFindings();
    renderResidual();
    renderCompareView();
    setCompare(compareOn);
  };

  const renderReport = (
    section: HTMLElement,
    lead: HTMLElement,
    list: HTMLElement,
    values: readonly string[],
    problemLead: string,
    clearLead: string,
    labelFor: (value: string) => string,
  ): void => {
    section.classList.toggle("is-problem", values.length > 0);
    section.classList.toggle("is-clear", values.length === 0);
    lead.textContent = values.length === 0 ? clearLead : problemLead;
    list.replaceChildren();
    list.hidden = values.length === 0;
    for (const value of values) {
      const item = doc.createElement("li");
      const code = doc.createElement("code");
      code.textContent = value;
      item.append(code, doc.createTextNode(` ${labelFor(value)}`));
      list.append(item);
    }
  };

  const renderRestore = (result: RestoreResult): void => {
    if (!state) return;
    restoreResult.hidden = false;
    restoredView.textContent = result.text;
    const problems = result.missing.length > 0 || result.altered.length > 0;
    restoreSummary.textContent = problems
      ? "Exact placeholders were put back. Anything missing or altered is listed below and was not guessed."
      : "Every exact placeholder was put back. Nothing was missing or altered.";
    renderReport(
      missingSection,
      missingLead,
      missingList,
      result.missing,
      "These placeholders do not appear in the answer. They were not filled in.",
      "No placeholders are missing.",
      (token) => {
        const surface = state?.mapping[token];
        return surface ? `stood for ${surface} in the scrubbed text.` : "was not filled in.";
      },
    );
    renderReport(
      alteredSection,
      alteredLead,
      alteredList,
      result.altered,
      "These do not match a placeholder in this session. They were left as written.",
      "No placeholders look altered.",
      () => "was left as written.",
    );
  };

  const clearOutputs = (): void => {
    scrubbedView.replaceChildren();
    originalView.replaceChildren();
    compareScrubbed.replaceChildren();
    findings.replaceChildren();
    residual.replaceChildren();
    findingsSummary.textContent = "";
    restoredView.textContent = "";
    restoreSummary.textContent = "";
    missingList.replaceChildren();
    alteredList.replaceChildren();
    restoreResult.hidden = true;
    pasteError.textContent = "";
    flagError.textContent = "";
    restoreError.textContent = "";
  };

  const scrubFrom = (text: string, partyText: string, sample: boolean): void => {
    void (async () => {
      pasteError.textContent = "";
      if (text.trim() === "") {
        pasteError.textContent = "Paste text before scrubbing.";
        source.focus();
        return;
      }
      scrubButton.disabled = true;
      trySampleButton.disabled = true;
      announce(sample ? "Loading the sample." : "Scrubbing.");
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const next = await runScrub(text, parseParties(partyText));
        setSession(next);
        pending = null;
        missed.value = next.source;
        sampleOn = sample;
        syncSample();
        renderReview();
        showStep("review");
        const count = next.findings.length;
        announce(
          sample
            ? `Sample loaded. ${count} finding${count === 1 ? "" : "s"}. Review them, then continue to restore.`
            : `Scrubbed. ${count} finding${count === 1 ? "" : "s"}. Review them before you copy.`,
        );
        focusHeading("review-heading");
      } catch (error) {
        pasteError.textContent = error instanceof Error ? error.message : "Scrubbing failed.";
        pasteError.focus();
      } finally {
        scrubButton.disabled = false;
        trySampleButton.disabled = false;
      }
    })();
  };

  pasteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    scrubFrom(source.value, parties.value, false);
  });

  trySampleButton.addEventListener("click", () => {
    source.value = SAMPLE_TEXT;
    parties.value = SAMPLE_PARTIES;
    scrubFrom(SAMPLE_TEXT, SAMPLE_PARTIES, true);
  });

  findings.addEventListener("click", (event) => {
    const button = buttonFrom(event);
    if (!button || button.dataset.action !== "unflag" || !state) return;
    const start = Number(button.dataset.start);
    const end = Number(button.dataset.end);
    const previous = state.findings.find((item) => item.start === start && item.end === end);
    void unflag(state, start, end).then((next) => {
      setSession(next);
      syncSample();
      renderReview();
      announce(previous ? `Un-flagged ${previous.placeholder}.` : "Un-flagged.");
      focusHeading("findings-heading");
    });
  });

  residual.addEventListener("click", (event) => {
    const button = buttonFrom(event);
    if (!button || button.dataset.action !== "flag-residual" || !state) return;
    const start = Number(button.dataset.start);
    const end = Number(button.dataset.end);
    const item = state.residual.find((entry) => entry.start === start && entry.end === end);
    if (!item) return;
    void addResidual(state, item).then((result) => {
      if (!result.ok) {
        flagError.textContent = result.message;
        flagError.focus();
        return;
      }
      setSession(result.state);
      syncSample();
      flagError.textContent = "";
      renderReview();
      announce(`Flagged ${item.text}.`);
      focusFinding(result.start);
    });
  });

  const rememberTextarea = (): void => {
    const live = rangeFromTextarea(missed);
    if (live) pending = live;
  };

  missed.addEventListener("select", rememberTextarea);
  missed.addEventListener("keyup", rememberTextarea);
  missed.addEventListener("pointerup", rememberTextarea);

  scrubbedView.addEventListener("pointerup", () => {
    const fromView = readViewSelection(scrubbedView);
    if (fromView && !("message" in fromView)) pending = fromView;
  });

  flagButton.addEventListener("pointerdown", () => {
    const fromView = readViewSelection(scrubbedView);
    if (fromView) {
      if (!("message" in fromView)) pending = fromView;
      return;
    }
    rememberTextarea();
  });

  flagButton.addEventListener("click", () => {
    void (async () => {
      if (!state) return;
      flagError.textContent = "";
      const range = currentRange();
      if (!range) {
        flagError.textContent = "Select a missed span in the source text or the scrubbed text.";
        flagError.focus();
        return;
      }
      if ("message" in range) {
        flagError.textContent = range.message;
        flagError.focus();
        return;
      }
      const result = await addSpan(state, range.start, range.end, flagKind.value);
      if (!result.ok) {
        flagError.textContent = result.message;
        flagError.focus();
        return;
      }
      setSession(result.state);
      syncSample();
      pending = null;
      flagError.textContent = "";
      renderReview();
      announce("Flagged the selection.");
      focusFinding(result.start);
    })();
  });

  viewScrubbed.addEventListener("click", () => {
    setCompare(false);
    announce("Showing the scrubbed text.");
  });

  viewCompare.addEventListener("click", () => {
    setCompare(true);
    announce("Showing the original beside the scrubbed text. Each replacement links to its placeholder.");
    originalView.focus();
  });

  comparePanel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a");
    if (!(link instanceof HTMLAnchorElement)) return;
    if (!focusCompareLink(doc, link)) return;
    event.preventDefault();
  });

  promptHost.addEventListener("click", (event) => {
    const button = buttonFrom(event);
    if (!button || button.dataset.action !== "copy-prompt") return;
    const starter = PROMPT_STARTERS.find((item) => item.id === button.dataset.prompt);
    if (!starter) return;
    const pre = doc.getElementById(`prompt-text-${starter.id}`);
    void copyFrom(starter.text, pre ?? button, `${starter.title} prompt copied.`);
  });

  required<HTMLButtonElement>("download-receipt").addEventListener("click", () => {
    void (async () => {
      if (!state) return;
      const includeValues = required<HTMLInputElement>("receipt-values").checked;
      const receipt = await buildReceipt({
        findings: state.findings,
        scrubbed: state.scrubbed,
        createdAt: new Date().toISOString(),
        includeValues,
      });
      const bytes = await receiptArchive(receipt);
      downloadBytes(doc, bytes, "isolated-sources-receipt.zip", "application/zip");
      announce(
        includeValues
          ? "Receipt downloaded. It includes the original values."
          : "Receipt downloaded. Original values were left out.",
      );
    })();
  });

  required<HTMLButtonElement>("copy-scrubbed").addEventListener("click", () => {
    if (!state) return;
    void copyFrom(state.scrubbed, scrubbedView, "Scrubbed text copied.");
  });

  required<HTMLButtonElement>("copy-restored").addEventListener("click", () => {
    void copyFrom(restoredView.textContent ?? "", restoredView, "Restored text copied.");
  });

  required<HTMLButtonElement>("edit-text").addEventListener("click", () => {
    setSession(null);
    sampleOn = false;
    syncSample();
    pending = null;
    compareOn = false;
    clearOutputs();
    setCompare(false);
    showStep("paste");
    announce("Back to the text. Scrub again before you copy or restore.");
    source.focus();
  });

  required<HTMLButtonElement>("continue-restore").addEventListener("click", () => {
    if (!state) return;
    if (sampleOn && stagedAnswer !== "") aiAnswer.value = stagedAnswer;
    showStep("restore");
    announce(sampleOn ? "Sample answer filled. Restore it to see the report." : "Paste the AI answer, then restore.");
    focusHeading("restore-heading");
  });

  required<HTMLButtonElement>("back-to-review").addEventListener("click", () => {
    if (!state) {
      showStep("paste");
      return;
    }
    showStep("review");
    focusHeading("review-heading");
  });

  restoreForm.addEventListener("submit", (event) => {
    event.preventDefault();
    restoreError.textContent = "";
    if (!state) {
      restoreError.textContent = "Scrub text before restoring.";
      restoreError.focus();
      return;
    }
    if (aiAnswer.value.trim() === "") {
      restoreError.textContent = "Paste the AI answer before restoring.";
      aiAnswer.focus();
      return;
    }
    const result = restore(aiAnswer.value, state.mapping);
    renderRestore(result);
    const problems = result.missing.length + result.altered.length;
    announce(
      problems === 0
        ? "Restored every exact placeholder."
        : `Restored exact placeholders. ${problems} missing or altered.`,
    );
    focusHeading("restore-result-heading");
  });

  clearButton.addEventListener("click", () => {
    setSession(null);
    sampleOn = false;
    syncSample();
    pending = null;
    compareOn = false;
    source.value = "";
    parties.value = "";
    missed.value = "";
    aiAnswer.value = "";
    clearOutputs();
    setCompare(false);
    showStep("paste");
    announce("Session cleared. The text and mapping are gone from this tab.");
    source.focus();
  });

  selfTestButton.addEventListener("click", () => {
    void (async () => {
      selfTestButton.disabled = true;
      selfTestResult.textContent = "Running scrub and restore on the sample.";
      try {
        const report = await runSelfTest();
        selfTestResult.textContent = selfTestMessage(report);
        announce("Self-test finished.");
      } catch {
        selfTestResult.textContent =
          "The self-test could not finish, so it cannot report a request count. connect-src 'none' tells the browser to block connections from the page. This does not detect airplane mode.";
        announce("Self-test could not finish.");
      } finally {
        selfTestButton.disabled = false;
      }
    })();
  });

  function currentRange(): ViewRead {
    const fromView = readViewSelection(scrubbedView);
    if (fromView) return fromView;
    const live = rangeFromTextarea(missed);
    if (live) return live;
    return pending;
  }

  function focusFinding(start: number): void {
    const item = findings.querySelector(`li[data-start="${start}"]`);
    if (!(item instanceof HTMLElement)) return;
    item.tabIndex = -1;
    item.focus();
  }

  async function copyFrom(text: string, fallback: HTMLElement, success: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        announce(success);
        return;
      }
    } catch {
      // The clipboard was refused. Select the text so the user can copy it.
    }
    selectContents(fallback);
    announce("Could not copy automatically. The text is selected so you can copy it.");
  }
}

function buttonFrom(event: Event): HTMLButtonElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const button = target.closest("button");
  return button instanceof HTMLButtonElement ? button : null;
}

function rangeFromTextarea(area: HTMLTextAreaElement): PendingRange | null {
  if (area.selectionStart === area.selectionEnd) return null;
  return { start: area.selectionStart, end: area.selectionEnd };
}

function readViewSelection(view: HTMLElement): ViewRead {
  let selection: Selection | null = null;
  try {
    selection = view.ownerDocument.getSelection();
  } catch {
    return null;
  }
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!view.contains(range.startContainer) || !view.contains(range.endContainer)) return null;
  const start = pointOrigin(range.startContainer, range.startOffset);
  const end = pointOrigin(range.endContainer, range.endOffset);
  if (!start || !end) {
    return { message: "Select a missed span in the scrubbed text, outside a placeholder." };
  }
  if ("placeholder" in start || "placeholder" in end) {
    return { message: "That selection includes a placeholder. Select only text that was not flagged." };
  }
  if (start.literal !== end.literal) {
    return { message: "Select one uninterrupted span that does not cross a placeholder." };
  }
  if (start.origin === end.origin) return null;
  return {
    start: Math.min(start.origin, end.origin),
    end: Math.max(start.origin, end.origin),
  };
}

function pointOrigin(
  node: Node,
  offset: number,
): { literal: HTMLElement; origin: number } | { placeholder: true } | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (offset < el.childNodes.length) return pointOrigin(el.childNodes[offset] as Node, 0);
    const last = el.childNodes[el.childNodes.length - 1];
    if (!last) return null;
    return pointOrigin(last, last.textContent?.length ?? 0);
  }
  const parent = node.parentElement;
  if (!parent) return null;
  if (parent.dataset.placeholder) return { placeholder: true };
  const literal = parent.closest<HTMLElement>("[data-origin-start]");
  if (!literal || !literal.contains(node)) return null;
  const base = Number(literal.dataset.originStart);
  let seen = 0;
  for (const child of literal.childNodes) {
    if (child === node) return { literal, origin: base + seen + offset };
    seen += child.textContent?.length ?? 0;
  }
  return null;
}

function selectContents(el: HTMLElement): void {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const selection = el.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
