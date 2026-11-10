import { expect, test } from "vitest";
import { FIRST_BOM_REVISION, formatBomRevision, isCBomRevision, nextBomRevision, nextCBomRevision } from "@/lib/bom-revision";

test("formatBomRevision shows the stored P/C label; a bare number reads as P", () => {
  expect(formatBomRevision("P03")).toBe("P03");
  expect(formatBomRevision("C01")).toBe("C01");
  expect(formatBomRevision("1")).toBe("P01");
  expect(formatBomRevision("12")).toBe("P12");
});

test("nextBomRevision counts P up until the BOM has a C, then only C", () => {
  expect(FIRST_BOM_REVISION).toBe("P01");
  expect(nextBomRevision([])).toBe(FIRST_BOM_REVISION);
  expect(nextBomRevision(["P01"])).toBe("P02");
  // Compared as numbers, not text: P10 > P09.
  expect(nextBomRevision(["P09", "P10"])).toBe("P11");
  expect(nextBomRevision(["P01", "P02", "C01"])).toBe("C02");
  expect(nextBomRevision(["1", "2"])).toBe("P03");
});

test("the client's approval gives the next C", () => {
  expect(nextCBomRevision(["P01", "P02"])).toBe("C01");
  expect(nextCBomRevision(["P01", "C01", "C02"])).toBe("C03");
  expect(isCBomRevision("C01")).toBe(true);
  expect(isCBomRevision("P01")).toBe(false);
  expect(isCBomRevision("3")).toBe(false);
});
