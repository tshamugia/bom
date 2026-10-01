// Rebuilds the static favicon files from the mark in src/lib/brand.ts:
//   src/app/icon.svg     — vector favicon for current browsers
//   src/app/favicon.ico  — 16/32/48 px PNGs for everything else
// Run after changing the mark: `npx tsx scripts/brand-icons.ts`.
// (apple-icon and the PWA icons are rendered on request from the same path.)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { markSvg } from "../src/lib/brand";

// Run from the repo root (tsx loads this file as CommonJS, so no import.meta).
const APP_DIR = join(process.cwd(), "src", "app");
const ICO_SIZES = [16, 32, 48];

async function png(svg: string, size: number) {
  return sharp(Buffer.from(svg), { density: 72 * Math.ceil(size / 16) * 4 }).resize(size, size).png().toBuffer();
}

// ICO = 6-byte header, a 16-byte directory entry per image, then the PNGs.
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  const svg = markSvg();
  writeFileSync(join(APP_DIR, "icon.svg"), `${svg}\n`);
  const images = await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await png(svg, size) })));
  writeFileSync(join(APP_DIR, "favicon.ico"), ico(images));
  console.log(`Wrote icon.svg and favicon.ico (${ICO_SIZES.join(", ")} px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
