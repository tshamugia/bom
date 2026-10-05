// Short explanations shown by the (?) buttons next to the app's less obvious
// rules. Each id is also the anchor of the matching section on /help, so a tip
// links straight to the long version. Client-safe: no server imports.
//
// When a rule changes (statuses, roles, what locks what), update the summary
// here and the section in `src/components/help/help-sections.tsx`.

export const HELP_TOPIC_IDS = [
  "overview",
  "roles",
  "bom-revisions",
  "bom-drawings",
  "bom-impact",
  "no-bom-change",
  "drawing-revisions",
  "drawing-statuses",
  "drawing-approval",
  "drawing-pdf",
  "transmittals",
  "procurement",
  "exports",
  "notifications",
  "catalog",
] as const;

export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number];

export type HelpTopic = { title: string; summary: string };

export const HELP_TOPICS: Record<HelpTopicId, HelpTopic> = {
  "overview": {
    title: "How it fits together",
    summary:
      "A project holds drawings and BOMs. Each BOM revision records which drawing revisions it was built from, so a drawing change shows up on the BOMs it affects.",
  },
  "roles": {
    title: "Roles",
    summary:
      "Admins manage users, settings and deletions. Members create and edit projects, BOMs and drawings. Viewers can look and download but not change anything — except confirming a revision issued to them.",
  },
  "bom-revisions": {
    title: "BOM revisions",
    summary:
      "A BOM is built in revisions — Rev A, Rev B… Only a Draft can be edited. Committing locks its lines. To change them later, create a new revision: it starts as a copy of the last one. The BOM's owner changes only with a new revision — pick them in the New revision dialog.",
  },
  "bom-drawings": {
    title: "Drawings linked to a BOM",
    summary:
      "A BOM revision records which drawing revisions it was built from. When a drawing gets a newer revision that changes the BOM, the link turns red — outdated.",
  },
  "bom-impact": {
    title: "Does this revision change the BOM?",
    summary:
      "Yes — quantities or items change, so BOMs built from earlier revisions turn outdated. No — layout, notes or title block only, so those BOMs stay current. You can correct the answer later in the revision history.",
  },
  "no-bom-change": {
    title: "Outdated drawings and “No BOM change”",
    summary:
      "If the newer drawing revision doesn't affect this BOM, mark it “No BOM change”: the BOM keeps its lines and stops showing as outdated. If it does, update the link on a draft, or create a new BOM revision.",
  },
  "drawing-revisions": {
    title: "Drawing revisions",
    summary:
      "Drawings go rev1, rev2… Only the latest revision can change status; older ones keep the status they had. A new revision starts as In Progress.",
  },
  "drawing-statuses": {
    title: "Drawing statuses",
    summary:
      "You can set most statuses freely. Awaiting approval, Approved A/B and As Built come only after the internal check — a second engineer approves the revision from Need to be approved.",
  },
  "drawing-approval": {
    title: "Internal check by a second engineer",
    summary:
      "Set Need to be approved and pick the approving engineer — not the owner and not yourself. Only that engineer can approve it, or send it back to In Progress with a comment.",
  },
  "drawing-pdf": {
    title: "Drawing PDF",
    summary:
      "The drawing owner or an admin uploads the PDF of the latest revision once the client approved it (Approved A, Approved B or As Built — an admin can allow it from Need to be approved). Viewers see that PDF only. A new upload replaces the old one, which stays in the archive.",
  },
  "transmittals": {
    title: "Transmittals",
    summary:
      "Issuing a revision records who received it and why. App users get an email and confirm receipt; people without an account are only recorded. Once a newer revision exists, older transmittals show as superseded.",
  },
  "procurement": {
    title: "Send to procurement",
    summary:
      "Emails the latest committed revision as an Excel file to the procurement list in Settings and marks it In review. A revision is sent once — to send changes, create a new revision, commit it and send that.",
  },
  "exports": {
    title: "Excel exports",
    summary:
      "Generate Excel downloads the file and lists it in History → Exports. Files aren't stored: downloading again rebuilds the file from the revision with the same options.",
  },
  "notifications": {
    title: "Emails and reminders",
    summary:
      "Status changes email the drawing owner, the approving engineer and the recipients set in Settings → Drawings and on the project page. Daily reminders are set up by an admin.",
  },
  "catalog": {
    title: "Catalog and vendors",
    summary:
      "BOM lines are picked from the item catalog; each item has a vendor and a category. Many items can be imported at once from the XLSX template — you see a dry run before anything is saved. Importing a BOM from a file adds its new SKUs too.",
  },
};

export function helpHref(id: HelpTopicId): string {
  return `/help#${id}`;
}
