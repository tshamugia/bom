import { describe, expect, test } from "vitest";
import { codePrefix, nextCode, transliterate } from "@/lib/codes";

describe("transliterate", () => {
  test("turns Georgian into Latin capitals", () => {
    expect(transliterate("აღობილი")).toBe("AGHOBILI");
    expect(transliterate("თბილისი მოლი")).toBe("TBILISI MOLI");
    expect(transliterate("შუქნიშანი ჭავჭავაძე")).toBe("SHUKNISHANI CHAVCHAVADZE");
  });

  test("drops accents and keeps Latin text and digits", () => {
    expect(transliterate("Café Zürich 2")).toBe("CAFE ZURICH 2");
  });
});

describe("codePrefix", () => {
  test("a single word gives its first three letters", () => {
    expect(codePrefix("BMW", "PRJ")).toBe("BMW");
    expect(codePrefix("Hilton", "PRJ")).toBe("HIL");
    expect(codePrefix("აღობილი", "PRJ")).toBe("AGH");
    expect(codePrefix("IO", "PRJ")).toBe("IO");
  });

  test("several words give their initials, at most four", () => {
    expect(codePrefix("BMW showroom", "PRJ")).toBe("BS");
    expect(codePrefix("Rover Mk II", "PRJ")).toBe("RMI");
    expect(codePrefix("Ground floor CCTV layout", "DWG")).toBe("GFCL");
    expect(codePrefix("Ground floor CCTV layout east wing", "DWG")).toBe("GFCL");
    expect(codePrefix("თბილისი მოლი", "PRJ")).toBe("TM");
  });

  test("filler words don't take an initial", () => {
    expect(codePrefix("The Hilton and Spa", "PRJ")).toBe("HS");
    expect(codePrefix("ქუჩა და მოედანი", "PRJ")).toBe("KM");
    // ...unless there is nothing else.
    expect(codePrefix("The", "PRJ")).toBe("THE");
  });

  test("punctuation separates words and digits count", () => {
    expect(codePrefix("Fire-alarm riser (Block 2)", "DWG")).toBe("FARB");
    expect(codePrefix("Tower 2", "PRJ")).toBe("T2");
  });

  test("falls back when the name has no letters or digits it can use", () => {
    expect(codePrefix("", "PRJ")).toBe("PRJ");
    expect(codePrefix("  — ", "DWG")).toBe("DWG");
    expect(codePrefix("Москва", "PRJ")).toBe("PRJ");
  });
});

describe("nextCode", () => {
  test("starts at 001", () => {
    expect(nextCode("BMW", [])).toBe("BMW-001");
  });

  test("goes one above the highest number used with the prefix, any case", () => {
    expect(nextCode("BMW", ["BMW-001", "bmw-007", "BMW-003"])).toBe("BMW-008");
  });

  test("ignores other prefixes and codes that don't follow the pattern", () => {
    expect(nextCode("BS", ["BSX-009", "BS-01A", "XBS-004", "BS-002"])).toBe("BS-003");
  });

  test("keeps counting past 999", () => {
    expect(nextCode("A", ["A-999"])).toBe("A-1000");
  });
});
