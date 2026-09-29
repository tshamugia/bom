import { expect, test } from "vitest";
import { EDITOR_ROLES, canEdit, isAdmin, roleOf } from "@/lib/roles";

test("roleOf keeps admin and viewer, and treats anything else as member", () => {
  expect(roleOf({ role: "admin" })).toBe("admin");
  expect(roleOf({ role: "viewer" })).toBe("viewer");
  expect(roleOf({ role: "member" })).toBe("member");
  expect(roleOf({ role: "owner" })).toBe("member");
  expect(roleOf(null)).toBe("member");
});

test("canEdit is false only for viewers", () => {
  expect(canEdit({ role: "admin" })).toBe(true);
  expect(canEdit({ role: "member" })).toBe(true);
  expect(canEdit({ role: "viewer" })).toBe(false);
  expect(EDITOR_ROLES).not.toContain("viewer");
});

test("a viewer is not an admin", () => {
  expect(isAdmin({ role: "viewer" })).toBe(false);
});
