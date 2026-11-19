import { expect, test } from "@playwright/test";

function crc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files: { name: string; data: Uint8Array }[]): Buffer {
  const u16 = (n: number) => Buffer.from([n & 255, (n >>> 8) & 255]);
  const u32 = (n: number) => Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const crc = crc32(file.data);
    const fileName = Buffer.from(file.name);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(fileName.length),
      u16(0),
      fileName,
      Buffer.from(file.data),
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(fileName.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      fileName,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, central, end]);
}

function docx(): Buffer {
  return storedZip([
    {
      name: "word/document.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Visible body stays</w:t></w:r></w:p></w:body></w:document>`,
      ),
    },
    {
      name: "docProps/core.xml",
      data: Buffer.from(
        `<cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:creator>Zelda Quinn</dc:creator></cp:coreProperties>`,
      ),
    },
  ]);
}

test("paste box is fully visible at 375x740", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto("/");
  const box = await page.locator("#source-text").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(740);
});

test("metadata strip still runs after the page goes offline", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const ready = (window as unknown as { __pageChunksReady?: Promise<void> }).__pageChunksReady;
    if (!ready) throw new Error("tool chunks were not started with the page");
    await ready;
  });
  await page.context().setOffline(true);
  await page.locator("#metadata-file").setInputFiles({
    name: "memo.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx(),
  });
  await expect(page.locator("#metadata-found")).toContainText("Zelda Quinn", { timeout: 15_000 });
  await expect(page.locator("#metadata-error")).toHaveText("");
});
