import { describe, expect, it } from "vitest";
import { HELP_TOPIC_IDS, HELP_TOPICS, type HelpTopicId } from "@/lib/help-topics";
import { HELP_SECTIONS, sectionsFor } from "@/components/help/help-sections";

const idsFor = (role: "admin" | "member" | "viewer") => sectionsFor(role).map(s => s.id);

describe("help topics", () => {
  it("gives every (?) topic a section on /help to link to", () => {
    const ids = new Set(HELP_SECTIONS.map(s => s.id));
    for (const id of HELP_TOPIC_IDS) expect(ids.has(id), `missing section #${id}`).toBe(true);
  });

  it("keeps section ids unique, so anchors don't collide", () => {
    const ids = HELP_SECTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("titles a topic's section the same as its tip", () => {
    for (const s of HELP_SECTIONS) {
      if (s.id in HELP_TOPICS) expect(s.title).toBe(HELP_TOPICS[s.id as HelpTopicId].title);
    }
  });

  it("shows viewers the topics their pages link to, and not the editing guides", () => {
    const ids = idsFor("viewer");
    // Tips a viewer can see: the View only pill, drawing status, transmittals.
    expect(ids).toEqual(expect.arrayContaining(["roles", "drawing-statuses", "transmittals", "viewer-start", "faq"]));
    for (const hidden of ["howto-bom", "bom-revisions", "procurement", "howto-drawing", "admin-users"]) {
      expect(ids).not.toContain(hidden);
    }
  });

  it("keeps the admin sections for admins", () => {
    expect(idsFor("admin")).toEqual(expect.arrayContaining(["admin-users", "admin-settings"]));
    expect(idsFor("member")).not.toContain("admin-users");
    expect(idsFor("member")).not.toContain("viewer-start");
  });
});
