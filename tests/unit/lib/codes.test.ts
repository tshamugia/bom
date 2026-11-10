import { describe, expect, test } from "vitest";
import {
  codePrefix, isProjectCode, nextCode, projectCodeLetterOptions, projectCodeLetters, projectCodeYear, transliterate,
} from "@/lib/codes";

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

describe("project codes", () => {
  test("letters are the first letter of the first word and the consonants after it", () => {
    expect(projectCodeLetters("Tegeta Motors")).toBe("TGT");
    expect(projectCodeLetters("თეგეტა მოტორს")).toBe("TGT");
    expect(projectCodeLetters("BMW showroom")).toBe("BMW");
    expect(projectCodeLetters("Hilton")).toBe("HLT");
    expect(projectCodeLetters("Insta")).toBe("INS");
  });

  test("company forms and filler words don't take a letter", () => {
    expect(projectCodeLetters("შპს თეგეტა მოტორს")).toBe("TGT");
    expect(projectCodeLetters("The Hilton LLC")).toBe("HLT");
  });

  test("short names borrow from the next words, then pad with X", () => {
    expect(projectCodeLetters("Ai Park")).toBe("APR");
    expect(projectCodeLetters("Oa")).toBe("OAX");
    expect(projectCodeLetters("Москва")).toBe("PRJ");
  });

  test("other options keep the first letter and step through the name", () => {
    const options = projectCodeLetterOptions("Hilton");
    expect(options[0]).toBe("HLT");
    expect(options[1]).toBe("HLN");
    expect(new Set(options).size).toBe(options.length);
    expect(options.every(o => /^H[A-Z]{2}$/.test(o))).toBe(true);
  });

  test("a project code is two digits and three capitals", () => {
    expect(isProjectCode("25TGT")).toBe(true);
    expect(isProjectCode("26017")).toBe(false);
    expect(isProjectCode("BS-005")).toBe(false);
    expect(isProjectCode("25tgt")).toBe(false);
    expect(projectCodeYear(new Date(2025, 5, 1))).toBe("25");
    expect(projectCodeYear(new Date(2105, 0, 1))).toBe("05");
  });
});
