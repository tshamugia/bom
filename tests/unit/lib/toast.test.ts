import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { toast as sonner } from "sonner";
import { toast } from "@/lib/toast";

describe("toast", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps errors and warnings until the user closes them", () => {
    toast.error("Couldn't save");
    toast.warning("Email not sent");
    expect(sonner.error).toHaveBeenCalledWith("Couldn't save", expect.objectContaining({ duration: Infinity }));
    expect(sonner.warning).toHaveBeenCalledWith("Email not sent", expect.objectContaining({ duration: Infinity }));
  });

  it("lets success toasts close on their own", () => {
    toast.success("Saved");
    expect(sonner.success).toHaveBeenCalledWith("Saved");
  });

  it("replaces an open toast with the same text instead of stacking a copy", () => {
    toast.error("Couldn't save");
    toast.error("Couldn't save");
    const ids = vi.mocked(sonner.error).mock.calls.map(c => (c[1] as { id?: unknown }).id);
    expect(ids[0]).toBeDefined();
    expect(ids[0]).toBe(ids[1]);
  });

  it("still takes a caller's own options", () => {
    toast.error("Retry later", { duration: 5000, id: "retry" });
    expect(sonner.error).toHaveBeenCalledWith("Retry later", expect.objectContaining({ duration: 5000, id: "retry" }));
  });
});
