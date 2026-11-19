const PDF_LIB_NOTICE = [
  "---------------------------------------------------------------------------",
  "pdf-lib",
  "Copyright (c) 2019 Andrew Dillon",
  "",
  "The MIT License (MIT)",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  'of this software and associated documentation files (the "Software"), to deal',
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "",
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
  "---------------------------------------------------------------------------",
].join("\n");

/**
 * Notice file shipped in the static build. Drops forge URLs so the public
 * files do not name a code host. The MIT text itself is kept.
 */
export function publicNotice(source: string, extra = ""): string {
  const kept = [source, PDF_LIB_NOTICE, extra]
    .join("\n")
    .split(/\r?\n/)
    .filter((line) => !line.toLowerCase().includes("github.com"))
    .join("\n")
    .trim();
  const notice = `${kept}\n`;
  if (notice.toLowerCase().includes("github.com")) {
    throw new Error("Public notice still names a code host.");
  }
  return notice;
}
