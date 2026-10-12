import { expect, test } from "vitest";
import { FIRST_BOM_REVISION, formatBomRevision, nextBomRevision } from "@/lib/bom-revision";

test("formatBomRevision labels a revision like a drawing revision", () => {
  expect(formatBomRevision("1")).toBe("Rev1");
  expect(formatBomRevision("12")).toBe("Rev12");
});

test("nextBomRevision is one more than the highest number", () => {
  expect(nextBomRevision([])).toBe(FIRST_BOM_REVISION);
  expect(nextBomRevision(["1"])).toBe("2");
  expect(nextBomRevision(["1", "2", "9"])).toBe("10");
  // Compared as numbers, not text: "10" > "9".
  expect(nextBomRevision(["9", "10"])).toBe("11");
});
