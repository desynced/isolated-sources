# Isolated Sources

Isolated Sources finds common identifiers in text and replaces them with stable placeholders such as `[PERSON_1]` and `[CASE_1]`. The same value always gets the same placeholder inside a session. You get the mapping back, and each hit includes the recognizer, its score, and the surrounding text so a review panel can show why it was flagged.

It runs in your browser. Nothing leaves your device. The library makes no network calls. The public Worker only redirects http to https and www to the apex; it does not read a request body.

It helps identify and replace common identifiers: contact details, account and government numbers, dates of birth when a birth cue is present, US street addresses, and a few legal labels (case, docket, Bates, and matter numbers, plus names after cues such as "Judge" or "v."). A list of known parties is always matched, including light variants such as "Mr. Doe". A name-model interface is included for a later in-browser model; the built-in stub finds no names on its own and does not download one.

It is not guaranteed to be complete. You must review the result, including anything the fail-safe pass still flags, before you rely on it.

Given model output and the mapping, `restore` swaps exact placeholders back and reports any placeholder that is missing or altered. It does not guess.

Pattern recognizers for common identifiers are ported from [Microsoft Presidio](https://github.com/data-privacy-stack/presidio) (MIT). See `NOTICE`.

```ts
import { restore, scrub } from "isolated-sources";

const { text, mapping, findings, residual } = await scrub(memo, {
  knownParties: ["Jordan Quinn", "Alex Rivera"],
});

const back = restore(modelOutput, mapping);
```

`findings` is the review list. `residual` is the second pass on the scrubbed text. `back.missing` and `back.altered` are placeholders the model dropped or changed.

## Site

The public page lives in `site/`. It scrubs and restores with this package in the browser. The mapping stays in memory for the tab.

Run `npm install`, then `npm run dev:site`, and open the local URL Vite prints.

`npm run build:site` typechecks the page and writes the static files to `site/dist`. `wrangler.jsonc` serves that folder behind a redirect-only Worker: http to https, and www to the apex, keeping the path and query. `npm test` includes the site flow.

## Next

- A journalist use case: notes and source names, with the known-party list, walked through on the page.

## Soon

- Verified PDF redaction: flatten or rasterize redacted pages and check that no text layer remains under the redactions. The check looks at the file you produce. It is not a security guarantee, and you still have to review the result before you rely on it.

### Later

Bookmarklet to scrub text selected on another page. It runs on that other website, so this site's security policy and the airplane-mode self-test do not apply there. It does not send the text anywhere.

Optional OCR for scanned PDFs and images. It stays off unless you choose a separate download of the engine and language data from this site. The main page does not load them.

## License

MIT © Joe Ball
