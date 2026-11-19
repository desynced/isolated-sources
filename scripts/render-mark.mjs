/**
 * Rasterize the bracket mark and the share card from site/public/favicon.svg.
 * Run from the repo root: node scripts/render-mark.mjs
 * Commit the files it writes. The site build does not run this.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { chromium } from "@playwright/test";

const VIEW = 16;
const NAVY = "#1c2433";
const AMBER = "#c98a2b";
const PAPER = "#f7f4ee";
const INK = "#1c1915";
const MUTED = "#3d3832";
const SERIF = "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf";
const SANS = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf";

const svg = readFileSync(new URL("../site/public/favicon.svg", import.meta.url), "utf8");
const rects = [...svg.matchAll(/<rect\b([^>]*)\/>/g)].map((match) => {
  const attr = Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]]));
  return {
    x: Number(attr.x ?? 0),
    y: Number(attr.y ?? 0),
    width: Number(attr.width),
    height: Number(attr.height),
    fill: attr.fill,
  };
});

if (rects.length !== 7 || rects.some((rect) => rect.fill !== NAVY && rect.fill !== AMBER)) {
  throw new Error("favicon.svg is not the bracket mark this script knows how to draw");
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hex(color) {
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

function rasterize(size) {
  if (size % VIEW !== 0) throw new Error(`size ${size} is not an integer scale of the 16px grid`);
  const scale = size / VIEW;
  const px = Buffer.alloc(size * size * 4);
  for (const rect of rects) {
    const [r, g, b] = hex(rect.fill);
    const x0 = rect.x * scale;
    const y0 = rect.y * scale;
    const x1 = (rect.x + rect.width) * scale;
    const y1 = (rect.y + rect.height) * scale;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * size + x) * 4;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = 255;
      }
    }
  }
  return px;
}

function paperSquare(size, markSize) {
  const [r, g, b] = hex(PAPER);
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  }
  const mark = rasterize(markSize);
  const origin = (size - markSize) / 2;
  for (let y = 0; y < markSize; y++) {
    for (let x = 0; x < markSize; x++) {
      const s = (y * markSize + x) * 4;
      if (mark[s + 3] === 0) continue;
      const d = ((y + origin) * size + (x + origin)) * 4;
      px[d] = mark[s];
      px[d + 1] = mark[s + 1];
      px[d + 2] = mark[s + 2];
      px[d + 3] = 255;
    }
  }
  return px;
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  const blobs = images.map(({ size, png }) => {
    const blob = png;
    return { size, blob };
  });
  blobs.forEach((image, index) => {
    const o = index * 16;
    entries[o] = image.size;
    entries[o + 1] = image.size;
    entries.writeUInt16LE(1, o + 4);
    entries.writeUInt16LE(32, o + 6);
    entries.writeUInt32LE(image.blob.length, o + 8);
    entries.writeUInt32LE(offset, o + 12);
    offset += image.blob.length;
  });
  return Buffer.concat([header, entries, ...blobs.map((image) => image.blob)]);
}

const publicDir = new URL("../site/public/", import.meta.url);
const png16 = encodePng(16, 16, rasterize(16));
const png32 = encodePng(32, 32, rasterize(32));
const png48 = encodePng(48, 48, rasterize(48));
writeFileSync(new URL("favicon-32.png", publicDir), png32);
writeFileSync(new URL("apple-touch-icon.png", publicDir), encodePng(180, 180, paperSquare(180, 112)));
writeFileSync(new URL("favicon.ico", publicDir), encodeIco([
  { size: 16, png: png16 },
  { size: 32, png: png32 },
  { size: 48, png: png48 },
]));

function decodePng(buf) {
  let o = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    o += 4;
    const type = buf.subarray(o, o + 4).toString("ascii");
    o += 4;
    const data = buf.subarray(o, o + len);
    o += len + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  const inflated = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[p++];
    const row = inflated.subarray(p, p + stride);
    p += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? recon[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 255;
      }
      recon[i] = v;
    }
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      out[s] = recon[x * bpp];
      out[s + 1] = recon[x * bpp + 1];
      out[s + 2] = recon[x * bpp + 2];
      out[s + 3] = bpp === 4 ? recon[x * bpp + 3] : 255;
    }
    prev = recon;
  }
  return { width, height, out };
}

function blit(dest, destW, src, srcW, srcH, dx, dy) {
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const s = (y * srcW + x) * 4;
      if (src[s + 3] === 0) continue;
      const d = ((y + dy) * destW + (x + dx)) * 4;
      dest[d] = src[s];
      dest[d + 1] = src[s + 1];
      dest[d + 2] = src[s + 2];
      dest[d + 3] = 255;
    }
  }
}

const cardHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: "Mark Serif"; src: url("file://${SERIF}"); font-weight: 700; font-style: normal; }
  @font-face { font-family: "Mark Sans"; src: url("file://${SANS}"); font-weight: 400; font-style: normal; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: ${PAPER}; }
  .rule { position: absolute; left: 372px; top: 223px; width: 96px; height: 8px; background: ${AMBER}; }
  .title {
    position: absolute; left: 373px; top: 261px; margin: 0;
    font-family: "Mark Serif", Georgia, serif; font-weight: 700; font-size: 76px;
    line-height: 1; color: ${INK}; white-space: nowrap;
  }
  .sub {
    position: absolute; left: 373px; top: 370px; margin: 0;
    font-family: "Mark Sans", "Segoe UI", sans-serif; font-weight: 400; font-size: 32px;
    line-height: 1; color: ${MUTED}; white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="rule"></div>
  <p class="title">Isolated Sources</p>
  <p class="sub">Legal patterns and exact restore, in your browser.</p>
</body>
</html>`;

const cardPath = join(tmpdir(), "isolated-sources-og.html");
writeFileSync(cardPath, cardHtml);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`file://${cardPath}`, { waitUntil: "load" });
const fontsReady = await page.evaluate(async () => {
  await document.fonts.load("700 76px 'Mark Serif'");
  await document.fonts.load("400 32px 'Mark Sans'");
  await document.fonts.ready;
  return {
    serif: document.fonts.check("700 76px 'Mark Serif'"),
    sans: document.fonts.check("400 32px 'Mark Sans'"),
  };
});
if (!fontsReady.serif || !fontsReady.sans) {
  throw new Error(`Share-card fonts did not load: ${JSON.stringify(fontsReady)}`);
}
const shot = await page.screenshot({ type: "png" });
await browser.close();

const card = decodePng(shot);
if (card.width !== 1200 || card.height !== 630) {
  throw new Error(`share card screenshot is ${card.width}x${card.height}`);
}
blit(card.out, card.width, rasterize(224), 224, 224, 86, 203);
writeFileSync(new URL("og.png", publicDir), encodePng(card.width, card.height, card.out));
console.log("wrote favicon-32.png, apple-touch-icon.png, favicon.ico, og.png");
