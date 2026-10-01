import { describe, expect, it } from "vitest";
import { cameFrom, recordPathname } from "@/lib/nav-history";

describe("nav history", () => {
  it("knows the page the user came from, and only that one", () => {
    expect(cameFrom("/drawings")).toBe(false);

    recordPathname("/drawings");
    expect(cameFrom("/drawings")).toBe(false); // a fresh load has no previous page

    recordPathname("/drawings/abc");
    expect(cameFrom("/drawings")).toBe(true);
    expect(cameFrom("/projects")).toBe(false);

    recordPathname("/drawings/abc"); // same path again (a re-render) changes nothing
    expect(cameFrom("/drawings")).toBe(true);

    recordPathname("/projects/p1");
    expect(cameFrom("/drawings")).toBe(false);
    expect(cameFrom("/drawings/abc")).toBe(true);
  });
});
