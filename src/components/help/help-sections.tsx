import Link from "next/link";
import { EDITOR_ROLES, type UserRole } from "@/lib/roles";
import { DRAWING_STATUSES, DRAWING_STATUS_LABEL, type DrawingStatus } from "@/lib/drawing-status";
import { MAX_DRAWING_FILE_MB } from "@/lib/drawing-files";
import { HELP_TOPICS, type HelpTopicId } from "@/lib/help-topics";
import { DrawingStatusBadge } from "@/components/drawings/drawing-status-badge";
import { HelpDiagram } from "./help-diagram";

// The long form of the (?) tips. Sections whose id is a HelpTopicId are the
// anchors those tips link to — keep both in step when a rule changes.

export const HELP_GROUPS = ["Start here", "BOMs", "Drawings", "Admin", "Questions"] as const;
export type HelpGroup = (typeof HELP_GROUPS)[number];

export type HelpSection = {
  id: string;
  group: HelpGroup;
  title: string;
  /** Who sees the section; everyone when left out. */
  roles?: readonly UserRole[];
  body: (role: UserRole) => React.ReactNode;
};

const EDITORS = EDITOR_ROLES;
const ADMIN = ["admin"] as const;

/** A label exactly as it appears on a button, tab or menu. */
const Ui = ({ children }: { children: React.ReactNode }) => <span className="help-ui">{children}</span>;

const topic = (id: HelpTopicId) => ({ id, title: HELP_TOPICS[id].title });

const STATUS_MEANING: Record<DrawingStatus, string> = {
  "in-progress": "Being drawn or reworked. Moving a revision back here clears its internal check.",
  "paused": "Work is stopped for now.",
  "need-approval": "Waiting for the internal check by the approving engineer.",
  "awaiting-approval": "Checked internally — waiting for approval.",
  "approved-a": "Approved.",
  "approved-b": "Approved with comments — put them in the status comment.",
  "as-built": "The final drawing of what was built.",
};

type Can = [label: string, admin: boolean, member: boolean, viewer: boolean];
const ROLE_COLUMNS = ["admin", "member", "viewer"] as const satisfies readonly UserRole[];

const PERMISSIONS: Can[] = [
  ["See projects, drawings, statuses and what was sent", true, true, true],
  ["Open and download the PDF of approved drawings", true, true, true],
  ["Download BOM Excel files that were sent", true, true, true],
  ["Confirm receipt of a drawing revision issued to you", true, true, true],
  ["Create and edit projects, BOMs and drawings", true, true, false],
  ["Commit BOM revisions, export, send to procurement", true, true, false],
  ["Mark a BOM approved by the client, or take the approval back", true, true, false],
  ["Change drawing status, issue transmittals, log hours", true, true, false],
  ["Own a drawing or approve it as the second engineer", true, true, false],
  ["Upload a drawing's PDF (as its owner)", true, true, false],
  ["Edit the item catalog and vendors", true, true, false],
  ["Delete or archive projects, BOMs, vendors, drawings (a BOM with a reason)", true, false, false],
  ["Create users, change roles, reset passwords", true, false, false],
  ["Settings: procurement email, drawing emails, reminders, disciplines", true, false, false],
  ["Audit log", true, false, false],
];

function Mark({ yes }: { yes: boolean }) {
  return yes
    ? <span className="help-yes" aria-label="Yes">✓</span>
    : <span className="help-no" aria-label="No">—</span>;
}

type FaqEntry = { q: string; a: React.ReactNode; roles?: readonly UserRole[] };

function Faq({ items }: { items: FaqEntry[] }) {
  return (
    <>
      {items.map(i => (
        <details key={i.q} className="help-faq">
          <summary>{i.q}</summary>
          <div className="help-faq-a">{i.a}</div>
        </details>
      ))}
    </>
  );
}

const FAQ: FaqEntry[] = [
  {
    q: "I can't edit the lines of a BOM.",
    roles: EDITORS,
    a: <p>The revision is committed or already sent, so it is read-only. Only a Draft can be edited — click <Ui>New revision</Ui> in the builder header to start a draft that copies the current lines. See <a href="#bom-revisions">BOM revisions</a>.</p>,
  },
  {
    q: "I can't change the owner of a BOM.",
    roles: EDITORS,
    a: <p>The owner changes only with a new revision. Commit (or discard) the open draft, then click <Ui>New revision</Ui> and pick the new owner. Viewers can&apos;t own a BOM. See <a href="#bom-revisions">BOM revisions</a>.</p>,
  },
  {
    q: "The “Commit revision” button doesn't commit.",
    roles: EDITORS,
    a: <p>A revision needs at least one line and no line with zero quantity. The commit dialog marks what is missing with ✗.</p>,
  },
  {
    q: "I can't set a BOM to Approved.",
    roles: EDITORS,
    a: <p>Only a committed revision can be approved — commit the draft first. Only the latest committed revision of a BOM changes status; while a newer draft is open, use <Ui>Change status</Ui> on that revision in the project&apos;s <Ui>History</Ui>. The comment is required: say who confirmed it and how. See <a href="#bom-statuses">BOM statuses</a>.</p>,
  },
  {
    q: "“Send to procurement” is greyed out.",
    roles: EDITORS,
    a: <p>Either nothing is committed yet, or the latest committed revision was already sent. Commit a new revision and send that one. The reason is written under the page title. See <a href="#procurement">Send to procurement</a>.</p>,
  },
  {
    q: "I can't pick Awaiting approval, Approved or As Built.",
    roles: EDITORS,
    a: <p>These come only after the internal check. Set <Ui>Need to be approved</Ui>, pick the approving engineer, and wait for them to approve. See <a href="#drawing-approval">Internal check</a>.</p>,
  },
  {
    q: "I can't approve a drawing.",
    roles: EDITORS,
    a: <p>Only the engineer named as the approving engineer can approve, and never the drawing owner. If the revision is assigned to you, the yellow panel at the top of the drawing has <Ui>Approve</Ui> and <Ui>Send back</Ui>.</p>,
  },
  {
    q: "“Send back” is greyed out.",
    roles: EDITORS,
    a: <p>Sending a revision back needs a comment that says what to fix.</p>,
  },
  {
    q: "I can't make someone the owner of a drawing.",
    roles: EDITORS,
    a: <p>The engineer who approves the latest revision can&apos;t also own the drawing — owner and approver stay two different people. Create a new revision first. Viewers can&apos;t own drawings.</p>,
  },
  {
    q: "I can't upload the drawing PDF.",
    roles: EDITORS,
    a: <p>Only the drawing owner or an admin uploads it, only to the latest revision, and only once the revision has the status the upload rule asks for — by default Approved A, Approved B or As Built. The reason is written on the <Ui>Drawing PDF</Ui> card. See <a href="#drawing-pdf">Drawing PDF</a>.</p>,
  },
  {
    q: "A BOM shows a drawing in red, or “outdated”.",
    roles: EDITORS,
    a: <p>That drawing has a newer revision that changes the BOM. Open <Ui>Review</Ui> on the BOM&apos;s drawings strip and decide: <Ui>No BOM change</Ui>, or update the BOM. See <a href="#no-bom-change">Outdated drawings</a>.</p>,
  },
  {
    q: "I can't find the Delete button.",
    roles: ["member"],
    a: <p>Deleting and archiving projects, BOMs, vendors and drawings is for admins. Ask an admin. An admin deleting a BOM gives a reason, which is kept in the audit log.</p>,
  },
  {
    q: "I can't edit anything or open the BOM builder.",
    roles: ["viewer"],
    a: <p>Your account is view-only: you can follow progress, confirm what was issued to you and download what was sent. Ask an admin if you need to edit.</p>,
  },
  {
    q: "Where do I confirm I received a drawing?",
    roles: ["viewer"],
    a: <p>On <Link href="/dashboard">Overview</Link> under <Ui>Issued to you</Ui> — click <Ui>Confirm receipt</Ui>. The drawing&apos;s <Ui>Transmittals</Ui> card has the same button.</p>,
  },
  {
    q: "Where is the drawing PDF?",
    roles: ["viewer"],
    a: <p>Open the drawing — the <Ui>Drawing PDF</Ui> card at the top has <Ui>Open</Ui> and <Ui>Download</Ui>. It shows up once the revision is approved and its owner uploaded the file. See <a href="#drawing-pdf">Drawing PDF</a>.</p>,
  },
  {
    q: "Where are the BOM Excel files?",
    roles: ["viewer"],
    a: <p>On <Link href="/approvals">Sent</Link> and in <Ui>Recently sent</Ui> on your Overview — the download icon gets the file.</p>,
  },
  {
    q: "I forgot my password.",
    a: <p>Ask an admin to reset it. You get a temporary password by email and choose your own at the next sign-in. Admins can also use <Ui>Forgot password?</Ui> on the sign-in page.</p>,
  },
  {
    q: "What do the colored messages mean?",
    a: (
      <ul>
        <li><span className="help-dot help-dot-green" aria-hidden /> <strong>Green</strong> — done. It closes by itself.</li>
        <li><span className="help-dot help-dot-yellow" aria-hidden /> <strong>Yellow</strong> — done, but something needs your attention (for example an email wasn&apos;t sent).</li>
        <li><span className="help-dot help-dot-red" aria-hidden /> <strong>Red</strong> — it didn&apos;t work; the message says why.</li>
      </ul>
    ),
  },
  {
    q: "Why do yellow and red messages stay on screen?",
    a: <p>So there is time to read them. Close them with the <Ui>×</Ui> in their corner.</p>,
  },
];

export const HELP_SECTIONS: HelpSection[] = [
  // ── Start here ────────────────────────────────────────────
  {
    ...topic("overview"),
    group: "Start here",
    body: role => (
      <>
        <HelpDiagram />
        <ul>
          <li>Everything lives in a <strong>project</strong>: its drawings and its BOMs.</li>
          <li>Projects and drawings get their <strong>code</strong> from their name when they are created — the initials (Georgian is spelt in Latin letters) and the next free number, e.g. <span className="mono">BS-001</span> for &ldquo;BMW showroom&rdquo;. Nobody types a code, and renaming keeps it, because files and transmittals carry it.</li>
          <li><strong>Drawings</strong> are the engineering drawing register. Each drawing has revisions (rev1, rev2…), a status, an owner and a due date.</li>
          <li><strong>BOMs</strong> (bills of materials) list what to buy. Each BOM has revisions too (Rev A, Rev B…). Lines come from the item catalog, which knows each item&apos;s vendor.</li>
          <li>The two meet where a <strong>BOM revision is built from drawing revisions</strong>. When a drawing gets a revision that changes the BOM, the BOMs built from the older one show it as outdated.</li>
          <li>
            What leaves the app: BOMs sent to procurement and drawing revisions issued to people — both listed under <Link href="/approvals">Sent</Link>.
            {role !== "viewer" && <> Excel files you generate are listed in <Link href="/history">History → Exports</Link>.</>}
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "viewer-start",
    group: "Start here",
    title: "What you can do",
    roles: ["viewer"],
    body: () => (
      <ol className="help-steps">
        <li><strong>Overview</strong> shows what was issued to you, drawing progress, what waits for approval, what was sent and what is coming up. Filter it by project at the top.</li>
        <li>When a drawing revision is issued to you, confirm it under <Ui>Issued to you</Ui> — the sender sees that you received it.</li>
        <li><strong>Drawings</strong> lists every drawing with its latest revision and status; open one to see its PDF, history, remarks and transmittals.</li>
        <li><strong>Sent</strong> lists BOMs sent to procurement (with the Excel file) and drawing revisions issued to people.</li>
      </ol>
    ),
  },
  {
    ...topic("roles"),
    group: "Start here",
    body: role => (
      <>
        <p>Your role is <strong className="capitalize">{role}</strong>. An admin sets roles on the Users page.</p>
        <div className="table-wrap">
          <table className="tbl help-roles">
            <thead>
              <tr>
                <th>Action</th>
                {ROLE_COLUMNS.map(r => (
                  <th key={r} className={r === role ? "help-me" : undefined}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map(([label, ...marks]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {marks.map((yes, i) => (
                    <td key={ROLE_COLUMNS[i]} className={ROLE_COLUMNS[i] === role ? "help-me" : undefined}>
                      <Mark yes={yes} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Buttons you can&apos;t use are hidden, so two people can see different buttons on the same page.</p>
      </>
    ),
  },

  // ── BOMs ──────────────────────────────────────────────────
  {
    id: "howto-bom",
    group: "BOMs",
    title: "Build a BOM, step by step",
    roles: EDITORS,
    body: () => (
      <ol className="help-steps">
        <li>Open the project and click <Ui>New BOM</Ui>. It starts as a Draft Rev A. (Or <Ui>Duplicate</Ui> an existing BOM from the builder, or pick <Ui>From file</Ui> to build it from the BOM template — see below.)</li>
        <li>In the <Link href="/builder">BOM Builder</Link>, add lines by searching the catalog, or with <Ui>Import</Ui> from the BOM template. Group lines into sections such as “Fire alarm” or “IT network”.</li>
        <li>Link the drawings the BOM is built from with <Ui>Manage</Ui> on the drawings strip — they are linked at their current revision.</li>
        <li>Click <Ui>Commit revision</Ui>. The lines lock.</li>
        <li>Click <Ui>Preview</Ui> to check the document, then <Ui>Generate Excel</Ui> to download it, or <Ui>Send to procurement</Ui> to email it.</li>
        <li>When the client confirms the BOM, click <Ui>Change status</Ui> → <Ui>Approved</Ui> and say who confirmed it.</li>
        <li>Something changed later? Click <Ui>New revision</Ui>: Rev B starts as a draft copy of Rev A.</li>
      </ol>
    ),
  },
  {
    id: "howto-bom-import",
    group: "BOMs",
    title: "Import a BOM from a file",
    roles: EDITORS,
    body: () => (
      <>
        <p>A BOM can come from a spreadsheet. The same file works in two places: <Ui>New BOM</Ui> → <Ui>From file</Ui> creates a BOM from it, and <Ui>Import</Ui> in the builder adds its lines to the open draft. Both dialogs have <Ui>Download template</Ui>.</p>
        <dl className="help-defs">
          <dt>section</dt>
          <dd>Optional. Rows with the same name form one section; in a draft, an existing section with that name is reused.</dd>
          <dt>sku, qty</dt>
          <dd>Required. The quantity is a whole number above 0, and each SKU is listed once.</dd>
          <dt>description … subcategory</dt>
          <dd>Only for SKUs the catalog doesn&apos;t have yet: the import adds them to the catalog (with any new vendor, category or subcategory), so a new SKU needs a description and a manufacturer. Items already in the catalog keep their own data.</dd>
        </dl>
        <p>After you choose the file you see a preview — lines, sections, new SKUs and any rows with errors. If a row has an error nothing is imported; fix the file and choose it again. A SKU that is already on the draft gets the file&apos;s quantity added to its line.</p>
      </>
    ),
  },
  {
    ...topic("bom-revisions"),
    group: "BOMs",
    roles: EDITORS,
    body: () => (
      <>
        <p>A BOM keeps every version as a revision: Rev A, Rev B, Rev C… Only a <strong>Draft</strong> can be edited, and a BOM has at most one draft at a time. Committing locks the lines; after that the revision only changes status — see <a href="#bom-statuses">BOM statuses</a>.</p>
        <p>To change a committed BOM, click <Ui>New revision</Ui> in the builder. The new draft copies the sections, lines and drawing links of the one before. <Ui>Discard draft</Ui> throws a draft away. Compare revisions from the project&apos;s <Ui>History</Ui>.</p>
        <p>A BOM&apos;s owner changes only together with a new revision. Pick the new owner in the <Ui>New revision</Ui> dialog (or <Ui>Clone</Ui> in History): the new draft and the BOM pass to them, earlier revisions keep their owner, and History shows who owned each one. Viewers can&apos;t own a BOM.</p>
      </>
    ),
  },
  {
    ...topic("bom-statuses"),
    group: "BOMs",
    body: role => (
      <>
        <p>The BOM Builder lists every BOM with the status of its latest revision, and its tabs filter by status:</p>
        <dl className="help-defs">
          <dt>Draft</dt>
          <dd>Being built. Editable. <Ui>Commit revision</Ui> moves it on.</dd>
          <dt>Committed</dt>
          <dd>Locked. Lines can&apos;t change. Ready to export, send to the client or send to procurement.</dd>
          <dt>Sent to procurement</dt>
          <dd>Emailed to procurement with <Ui>Send to procurement</Ui>. Still locked.</dd>
          <dt>Approved</dt>
          <dd>The client confirmed this revision. Set by hand, with a comment saying who confirmed it and how.</dd>
        </dl>
        {role !== "viewer" && (
          <>
            <p>Draft, Committed and Sent to procurement follow the buttons. Only <strong>Approved</strong> is set by hand: click <Ui>Change status</Ui> in the builder header (or on the revision in the project&apos;s <Ui>History</Ui>), pick <Ui>Approved</Ui> and write the comment. Your name, the time and the comment show under the BOM title and in History → Activity.</p>
            <ul>
              <li>Taking an approval back also needs a comment. The revision returns to Committed, or to Sent to procurement if it was already emailed.</li>
              <li>An approved revision can still be sent to procurement — once — and stays Approved.</li>
              <li>Only the latest committed revision of a BOM changes status; older revisions keep the status they had. A newer draft doesn&apos;t stop you approving the committed revision before it.</li>
            </ul>
          </>
        )}
      </>
    ),
  },
  {
    ...topic("bom-drawings"),
    group: "BOMs",
    roles: EDITORS,
    body: () => (
      <>
        <p>The drawings strip at the top of the builder shows which drawing revisions the current BOM revision was built from, e.g. <span className="pill"><span className="mono">ELV-101</span> rev2</span>.</p>
        <ul>
          <li>Link and unlink drawings with <Ui>Manage</Ui> — only on a Draft. A drawing is linked at its latest revision.</li>
          <li><strong>Red</strong> — outdated: the drawing has a newer revision that changes the BOM, e.g. <span className="pill help-pill-red"><span className="mono">ELV-101</span> rev2 → rev3</span>.</li>
          <li><strong>✓ rev3</strong> — the drawing has newer revisions, but none of them changes the BOM, or someone checked them.</li>
          <li>On a drawing page, <Ui>Used in BOMs</Ui> shows the same link from the drawing&apos;s side.</li>
        </ul>
      </>
    ),
  },
  {
    ...topic("no-bom-change"),
    group: "BOMs",
    roles: EDITORS,
    body: () => (
      <>
        <p>When a BOM shows outdated drawings, click <Ui>Review</Ui> on its drawings strip. For each drawing you see the newer revisions and what changed. Then:</p>
        <ul>
          <li><Ui>No BOM change</Ui> — the change doesn&apos;t affect this BOM. The BOM keeps its lines and its revision, and stops showing the drawing as outdated. This works on committed revisions too.</li>
          <li><Ui>Update to rev3</Ui> — on a Draft, moves the link to the newer drawing revision. Adjust the lines if needed, then commit.</li>
          <li>On a committed BOM that does need changes, click <Ui>New revision</Ui>, update the lines and the links in the draft, and commit it.</li>
        </ul>
      </>
    ),
  },
  {
    ...topic("exports"),
    group: "BOMs",
    roles: EDITORS,
    body: () => (
      <>
        <p>On the Preview page, choose the columns and grouping, then <Ui>Generate Excel</Ui>. The file downloads and is listed in <Link href="/history">History → Exports</Link>.</p>
        <p>Files aren&apos;t stored. Downloading again rebuilds the file from the revision with the same options: a committed revision gives the same file, a draft gives the draft as it is now (its file name says DRAFT).</p>
      </>
    ),
  },
  {
    ...topic("procurement"),
    group: "BOMs",
    roles: EDITORS,
    body: () => (
      <>
        <p><Ui>Send to procurement</Ui> on the Preview page emails the latest <strong>committed</strong> revision as an Excel file to the procurement list. A committed revision becomes <strong>Sent to procurement</strong>; one the client already approved stays <strong>Approved</strong>. It shows up under <Link href="/approvals">Sent</Link>.</p>
        <ul>
          <li>If you are looking at a draft, the button sends the latest committed revision — its letter is shown on the button.</li>
          <li>A revision is sent once. To send changes, create a new revision, commit it and send that.</li>
          <li>The recipients and the email text are set by an admin in Settings → Procurement email. If they are missing, the app says so in a red message.</li>
        </ul>
      </>
    ),
  },
  {
    ...topic("catalog"),
    group: "BOMs",
    roles: EDITORS,
    body: () => (
      <>
        <p>BOM lines come from the <Link href="/catalog">Item catalog</Link>. Each item has a SKU, a category and a vendor from <Link href="/vendors">Vendors</Link>.</p>
        <p>To add many items at once, use <Ui>Import</Ui> on the catalog page with the XLSX template. You first see a dry run — rows to add, rows to update and rows with errors — and nothing is saved until you click <Ui>Import</Ui>.</p>
        <p>Importing a BOM from a file also adds the SKUs the catalog doesn&apos;t have yet.</p>
      </>
    ),
  },

  // ── Drawings ──────────────────────────────────────────────
  {
    id: "howto-drawing",
    group: "Drawings",
    title: "Take a drawing from start to approval",
    roles: EDITORS,
    body: () => (
      <ol className="help-steps">
        <li>On <Link href="/drawings">Drawings</Link>, click <Ui>New drawing</Ui>: project, name, owner and due date. The code is made from the name — its initials and the next free number in the project, e.g. <span className="mono">GFCL-001</span> for &ldquo;Ground floor CCTV layout&rdquo;. Add the <Ui>File location</Ui> — the folder on the file server, e.g. <span className="mono">2026/BMW/CCTV</span> — so others can find the files. It starts at rev1, In Progress.</li>
        <li>Work on it. Log hours in <Ui>Time</Ui> and track client or site comments in <Ui>Remarks</Ui>.</li>
        <li>When it is ready, <Ui>Change status</Ui> → <Ui>Need to be approved</Ui> and pick the approving engineer.</li>
        <li>That engineer approves it (→ Awaiting approval) or sends it back with a comment (→ In Progress).</li>
        <li>Set the approval result: Approved A, Approved B (with comments) or later As Built.</li>
        <li>The owner uploads the approved PDF on the <Ui>Drawing PDF</Ui> card — viewers can open it from then on.</li>
        <li>Issue it to the people who need it with <Ui>Issue</Ui> on the Transmittals card.</li>
        <li>Drawing changed? Click <Ui>New revision</Ui> and say whether it changes the BOM.</li>
      </ol>
    ),
  },
  {
    ...topic("drawing-revisions"),
    group: "Drawings",
    body: () => (
      <>
        <p>A drawing keeps every issue as a revision: rev1, rev2, rev3… The page shows the latest one; older ones are listed under <Ui>Revisions</Ui> with their history.</p>
        <ul>
          <li>Only the latest revision can change status. Older revisions keep the status they had when the next one was created.</li>
          <li>A new revision starts as In Progress, with a note on what changed.</li>
          <li>Transmittals of older revisions show as <em>superseded</em>.</li>
        </ul>
      </>
    ),
  },
  {
    ...topic("drawing-statuses"),
    group: "Drawings",
    body: () => (
      <>
        <div className="table-wrap">
          <table className="tbl help-statuses">
            <tbody>
              {DRAWING_STATUSES.map(s => (
                <tr key={s}>
                  <td><DrawingStatusBadge status={s} /></td>
                  <td>{STATUS_MEANING[s]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Most statuses can be set in any order. The exception: <strong>{DRAWING_STATUS_LABEL["awaiting-approval"]}</strong> and
          everything after it need the internal check first — see <a href="#drawing-approval">below</a>. Approved and As Built
          drawings no longer count as overdue.
        </p>
      </>
    ),
  },
  {
    ...topic("drawing-approval"),
    group: "Drawings",
    body: role => (
      <>
        <p>Before a revision goes out for approval, a second engineer checks it:</p>
        <ol className="help-steps">
          <li>Someone sets the status to <Ui>Need to be approved</Ui> and picks the approving engineer. It can&apos;t be the drawing owner, and it can&apos;t be the person asking.</li>
          <li>The approving engineer gets an email and sees a yellow panel on the drawing.</li>
          <li><Ui>Approve</Ui> moves it to Awaiting approval. <Ui>Send back</Ui> returns it to In Progress and needs a comment.</li>
        </ol>
        <p>Only the assigned engineer can approve. The engineer approving the latest revision can&apos;t become the drawing&apos;s owner either — so nobody can check their own work.</p>
        {role === "viewer" && <p className="muted">Viewers can&apos;t own or approve drawings.</p>}
      </>
    ),
  },
  {
    ...topic("drawing-pdf"),
    group: "Drawings",
    body: role => (
      <>
        {role === "viewer" ? (
          <p>Open a drawing and use <Ui>Open</Ui> or <Ui>Download</Ui> on the <Ui>Drawing PDF</Ui> card. You see the PDF of the latest approved revision — while a newer revision is still being worked on, you keep seeing the approved one.</p>
        ) : (
          <p>Each drawing revision can carry one PDF — the copy that goes to site and to the client. The working files stay on the file server under <Ui>File location</Ui>.</p>
        )}
        <ul>
          <li>The <strong>drawing owner</strong> or an <strong>admin</strong> uploads it, on the <Ui>Drawing PDF</Ui> card, to the latest revision only.</li>
          <li>Uploads open once the client approved the revision: <strong>Approved A, Approved B or As Built</strong>. An admin can open them earlier, from <strong>Need to be approved</strong>, in Settings → Drawings. Viewers see the PDF from the same point.</li>
          <li>PDF only, up to {MAX_DRAWING_FILE_MB} MB. Whatever the file was called, it is saved and downloaded as <span className="mono">CODE_rev3.pdf</span>; the original name is shown next to it.</li>
          <li>A new upload replaces the current PDF. The old one is kept in the archive and the revision history says who replaced it. An admin can remove a wrong PDF, with a reason.</li>
          {role !== "viewer" && <li>Earlier revisions keep their PDFs — open them under <Ui>Revisions</Ui>.</li>}
        </ul>
      </>
    ),
  },
  {
    ...topic("bom-impact"),
    group: "Drawings",
    roles: EDITORS,
    body: () => (
      <>
        <p>Creating a new drawing revision asks <strong>“Does this change the BOM?”</strong></p>
        <ul>
          <li><strong>Yes — quantities or items change.</strong> Every BOM built from an earlier revision shows this drawing as outdated until someone reviews it.</li>
          <li><strong>No BOM change.</strong> Layout, annotations, title block… BOMs built from earlier revisions stay current.</li>
        </ul>
        <p>Picked wrong? Under <Ui>Revisions</Ui>, the latest revision has <Ui>Mark as no BOM change</Ui> / <Ui>Mark as changing the BOM</Ui>.</p>
      </>
    ),
  },
  {
    ...topic("transmittals"),
    group: "Drawings",
    body: role => (
      <>
        <p>A transmittal records that a drawing revision was issued to someone, and why: for approval, for construction, for information or for comment.</p>
        <ul>
          {role !== "viewer" && <li>Issue the latest revision with <Ui>Issue</Ui> on the drawing&apos;s Transmittals card. Pick app users or type the name of someone without an account.</li>}
          <li>App users get an email and confirm receipt (<Ui>Acknowledge</Ui> on the drawing, <Ui>Confirm receipt</Ui> on the viewer Overview). People without an account are only recorded.</li>
          <li>Once a newer revision exists, older transmittals show as superseded — the recipient should work from the new one.</li>
          <li>Everything issued is listed under <Link href="/approvals">Sent</Link>.</li>
        </ul>
      </>
    ),
  },
  {
    ...topic("notifications"),
    group: "Drawings",
    body: () => (
      <>
        <p>When a drawing changes status, these people get an email with the revision note and the comment:</p>
        <ul>
          <li>the drawing owner and the approving engineer,</li>
          <li>everyone on the list in Settings → Drawings,</li>
          <li>the extra recipients on that project&apos;s page.</li>
        </ul>
        <p>Admins can also switch on a morning reminder digest — overdue drawings, pending approvals, open remarks and unconfirmed transmittals — in Settings → Drawings.</p>
      </>
    ),
  },

  // ── Admin ─────────────────────────────────────────────────
  {
    id: "admin-users",
    group: "Admin",
    title: "Users and passwords",
    roles: ADMIN,
    body: () => (
      <ul>
        <li>There is no public sign-up. Create accounts on <Link href="/users">Users</Link> and pick a role.</li>
        <li>The password you set is temporary: it is emailed to the user, who must choose their own at the first sign-in. Passwords need at least 12 characters.</li>
        <li><Ui>Reset password</Ui> sets a new temporary password and signs the user out everywhere.</li>
        <li>Disabling a user blocks sign-in but keeps their history.</li>
        <li>If the email can&apos;t be sent, a yellow message says so — then give the password to the person yourself.</li>
      </ul>
    ),
  },
  {
    id: "admin-settings",
    group: "Admin",
    title: "Settings only admins change",
    roles: ADMIN,
    body: () => (
      <ul>
        <li><Link href="/settings/procurement">Procurement email</Link> — who receives BOMs sent to procurement, and the email text.</li>
        <li><Link href="/settings/drawings">Drawings</Link> — who gets status emails for every drawing, the daily reminders, the list of disciplines and from which status drawing PDFs can be uploaded.</li>
        <li>Each project page can add more recipients for that project only.</li>
        <li><Link href="/audit">Audit log</Link> — sign-ins, password resets, role changes, settings and deletions. Everyone else sees ordinary activity in History → Activity.</li>
      </ul>
    ),
  },

  // ── Questions ─────────────────────────────────────────────
  {
    id: "faq",
    group: "Questions",
    title: "Why can't I…?",
    body: role => <Faq items={FAQ.filter(i => !i.roles || i.roles.includes(role))} />,
  },
];

export function sectionsFor(role: UserRole): HelpSection[] {
  return HELP_SECTIONS.filter(s => !s.roles || s.roles.includes(role));
}
