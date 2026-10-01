import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_BLUE, MARK_PATH, markDataUrl, markSvg } from "@/lib/brand";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p));

describe("brand mark", () => {
  it("icon.svg is the current mark (rerun scripts/brand-icons.ts after changing it)", () => {
    expect(read("src/app/icon.svg").toString().trim()).toBe(markSvg());
  });

  it("favicon.ico holds 16, 32 and 48 px images", () => {
    const ico = read("src/app/favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + i * 16));
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("the offline page draws the same mark", () => {
    const html = read("public/offline.html").toString();
    expect(html).toContain(MARK_PATH);
    expect(html).toContain(BRAND_BLUE);
  });

  it("markSvg rounds and scales on request", () => {
    expect(markSvg({ radius: 0 })).toContain('rx="0"');
    expect(markSvg()).not.toContain("transform");
    expect(markSvg({ scale: 0.84 })).toContain("scale(0.84)");
    expect(markDataUrl()).toMatch(/^data:image\/svg\+xml;utf8,%3Csvg/);
  });
});
