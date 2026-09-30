import { describe, expect, test } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  test("keeps paths on this site", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/projects/abc?tab=drawings#x")).toBe("/projects/abc?tab=drawings#x");
  });

  test("falls back when there is nothing to go to", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(undefined, "/dashboard")).toBe("/dashboard");
  });

  test("refuses other sites", () => {
    for (const raw of [
      "https://evil.example/login",
      "http://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
    ]) {
      expect(safeNextPath(raw)).toBe("/");
    }
  });
});
