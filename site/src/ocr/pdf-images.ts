import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

function filterNames(filter: unknown): string[] {
  if (filter instanceof PDFName) return [filter.asString()];
  if (filter && typeof filter === "object" && "asArray" in filter && typeof filter.asArray === "function") {
    return filter.asArray().map((item: unknown) => (item instanceof PDFName ? item.asString() : ""));
  }
  return [];
}

/** Pull embedded JPEG images out of a PDF. This does not render the page. */
export async function jpegImages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const images: Uint8Array[] = [];
  for (let index = 0; index < doc.getPageCount(); index++) {
    const resources = doc.getPage(index).node.lookup(PDFName.of("Resources"));
    if (!(resources instanceof PDFDict)) continue;
    const xobjects = resources.lookup(PDFName.of("XObject"));
    if (!(xobjects instanceof PDFDict)) continue;
    for (const key of xobjects.keys()) {
      const object = xobjects.lookup(key);
      if (!(object instanceof PDFRawStream)) continue;
      const names = filterNames(object.dict.lookup(PDFName.of("Filter")));
      if (!names.some((name) => name.includes("DCTDecode"))) continue;
      const data = object.getContents();
      if (data.length > 2 && data[0] === 0xff && data[1] === 0xd8) images.push(data);
    }
  }
  return images;
}
