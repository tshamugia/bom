import { describe, expect, it } from "vitest";
import {
  BOM_STATUSES, BOM_STATUS_LABEL, REVISION_STATUSES, bomStatusTargets, canSendToProcurement, checkBomStatusChange,
} from "@/lib/bom-status";
import { revisionStatusEnum } from "@/db/schema/enums";

const change = (over: Partial<Parameters<typeof checkBomStatusChange>[0]> = {}) =>
  checkBomStatusChange({ from: "committed", to: "approved", sent: false, isLatest: true, comment: "Client email 5 Oct", ...over });

describe("BOM statuses", () => {
  it("keeps the enum and the labels in step", () => {
    expect(revisionStatusEnum.enumValues).toEqual([...REVISION_STATUSES]);
    for (const s of REVISION_STATUSES) expect(BOM_STATUS_LABEL[s]).toBeTruthy();
    expect(BOM_STATUSES).toEqual(["draft", "committed", "review", "approved"]);
  });

  it("offers only the client's approval, and taking it back to where the revision was", () => {
    expect(bomStatusTargets({ from: "draft", sent: false })).toEqual([]);
    expect(bomStatusTargets({ from: "committed", sent: false })).toEqual(["approved"]);
    expect(bomStatusTargets({ from: "review", sent: true })).toEqual(["approved"]);
    expect(bomStatusTargets({ from: "approved", sent: false })).toEqual(["committed"]);
    expect(bomStatusTargets({ from: "approved", sent: true })).toEqual(["review"]);
    expect(bomStatusTargets({ from: "locked", sent: true })).toEqual([]);
  });

  it("approves a committed or sent revision with a comment", () => {
    expect(change()).toEqual({ ok: true });
    expect(change({ from: "review", sent: true })).toEqual({ ok: true });
    expect(change({ from: "approved", to: "committed", comment: "Client withdrew it" })).toEqual({ ok: true });
  });

  it("needs a comment, also for taking the approval back", () => {
    expect(change({ comment: "" })).toEqual({ ok: false, error: "COMMENT_REQUIRED" });
    expect(change({ comment: "   " })).toEqual({ ok: false, error: "COMMENT_REQUIRED" });
    expect(change({ from: "approved", to: "committed", comment: null })).toEqual({ ok: false, error: "COMMENT_REQUIRED" });
  });

  it("leaves drafts to the Commit button and older revisions alone", () => {
    expect(change({ from: "draft" })).toEqual({ ok: false, error: "DRAFT" });
    expect(change({ isLatest: false })).toEqual({ ok: false, error: "REVISION_LOCKED" });
    expect(change({ from: "approved", to: "approved" })).toEqual({ ok: false, error: "SAME_STATUS" });
  });

  it("never sets Sent to procurement, Draft or Released by hand", () => {
    expect(change({ to: "review" })).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(change({ to: "draft" })).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(change({ to: "locked" })).toEqual({ ok: false, error: "NOT_ALLOWED" });
    // An approval that was never emailed can't come back as "sent".
    expect(change({ from: "approved", to: "review", sent: false })).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });

  it("sends a committed or approved revision to procurement once", () => {
    expect(canSendToProcurement({ status: "committed", sent: false })).toBe(true);
    expect(canSendToProcurement({ status: "approved", sent: false })).toBe(true);
    expect(canSendToProcurement({ status: "approved", sent: true })).toBe(false);
    expect(canSendToProcurement({ status: "review", sent: true })).toBe(false);
    expect(canSendToProcurement({ status: "draft", sent: false })).toBe(false);
  });
});
