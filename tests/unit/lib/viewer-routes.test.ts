import { describe, expect, test } from "vitest";
import { viewerRedirect } from "@/lib/viewer-routes";
import { formatRelative } from "@/lib/format";

describe("viewerRedirect", () => {
  test("sends builder pages to the matching preview", () => {
    expect(viewerRedirect("/builder")).toBe("/preview");
    expect(viewerRedirect("/builder/p1/b1")).toBe("/preview/p1/b1");
  });

  test("sends master data and history home", () => {
    for (const path of ["/catalog", "/catalog/import", "/vendors", "/history"]) {
      expect(viewerRedirect(path)).toBe("/dashboard");
    }
  });

  test("sends project history and diff back to the project", () => {
    expect(viewerRedirect("/projects/p1/history")).toBe("/projects/p1");
    expect(viewerRedirect("/projects/p1/diff")).toBe("/projects/p1");
  });

  test("leaves the viewer's own pages alone", () => {
    for (const path of ["/dashboard", "/projects", "/projects/p1", "/drawings", "/drawings/d1", "/approvals", "/preview/p1/b1", "/settings/profile", "/catalogue"]) {
      expect(viewerRedirect(path)).toBeNull();
    }
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  test("minutes, hours and days", () => {
    expect(formatRelative(ago(20_000), now)).toBe("just now");
    expect(formatRelative(ago(25 * 60_000), now)).toBe("25m ago");
    expect(formatRelative(ago(5 * 3_600_000), now)).toBe("5h ago");
    expect(formatRelative(ago(3 * 86_400_000), now)).toBe("3d ago");
  });

  test("falls back to the date after two weeks", () => {
    expect(formatRelative(new Date("2026-09-01T12:00:00Z"), now)).toBe("1 Sept 2026");
  });
});
