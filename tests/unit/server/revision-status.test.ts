import { expect, test } from "vitest";
import {
  isRevisionImmutable,
  isRevisionProcurementEligible,
} from "@/server/lib/revision-status";

test("isRevisionImmutable returns false for draft", () => {
  expect(isRevisionImmutable("draft")).toBe(false);
});

test("isRevisionImmutable returns true for committed and locked", () => {
  expect(isRevisionImmutable("committed")).toBe(true);
  expect(isRevisionImmutable("locked")).toBe(true);
});

test("isRevisionImmutable returns true for in-flight approval states", () => {
  expect(isRevisionImmutable("in-progress")).toBe(true);
  expect(isRevisionImmutable("review")).toBe(true);
  expect(isRevisionImmutable("approved")).toBe(true);
});

test("isRevisionProcurementEligible is true only for committed/in-flight/locked", () => {
  expect(isRevisionProcurementEligible("draft")).toBe(false);
  expect(isRevisionProcurementEligible("committed")).toBe(true);
  expect(isRevisionProcurementEligible("in-progress")).toBe(true);
  expect(isRevisionProcurementEligible("review")).toBe(true);
  expect(isRevisionProcurementEligible("approved")).toBe(true);
  expect(isRevisionProcurementEligible("locked")).toBe(true);
});
