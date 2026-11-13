import Link from "next/link";
import { EDITOR_ROLES, type UserRole } from "@/lib/roles";
import { DRAWING_STATUSES, DRAWING_STATUS_LABEL, type DrawingStatus } from "@/lib/drawing-status";
import { MAX_DRAWING_FILE_MB } from "@/lib/drawing-files";
import { MAX_DXF_MB } from "@/lib/drawing-checks";
import { MAX_BULK_DRAWINGS } from "@/lib/drawing-bulk";
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
  ["Check a drawing's DXF automatically", true, true, false],
  ["Edit the item catalog and vendors", true, true, false],
  ["Delete or archive projects, BOMs, vendors, drawings (a BOM with a reason)", true, false, false],
  ["Create users, change roles, reset passwords", true, false, false],
  ["Settings: procurement email, drawing emails, reminders, disciplines, DXF checks", true, false, false],
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
          <li>A <strong>project code</strong> is the year and three letters from the name, as in the drawing standard (NAMING §4.2): <span className="mono">26TGT</span> for &ldquo;Tegeta Motors&rdquo; (Georgian is spelt in Latin letters). The New project dialog suggests both and you may change them there; a code that is taken — archived projects count — can&apos;t be used again. After that only an admin changes it, from the project passport, because drawing file names carry it (<span className="mono">INS-26TGT-ZZ-00-FA-102</span>).</li>
          <li><strong>Drawing codes</strong> come from the drawing&apos;s name — its initials and the next free number in the project, e.g. <span className="mono">GFCL-001</span>. Nobody types them, and renaming keeps them.</li>
          <li><strong>Drawings</strong> are the engineering drawing register. Each drawing has revisions, a status, an owner and a due date. Revisions follow the drawing standard: <span className="mono">P01</span>, <span className="mono">P02</span>… until the client approves the drawing, <span className="mono">C01</span>, <span className="mono">C02</span>… from then on — see <a href="#drawing-revisions">Drawing revisions</a>.</li>
          <li><strong>BOMs</strong> (bills of materials) list what to buy. Each BOM has revisions too, labelled like drawing revisions: P01, P02… until the client approves the BOM, then C01, C02… Lines come from the item catalog, which knows each item&apos;s vendor.</li>
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
        <li>When a drawing revision is issued to you, confirm it under <Ui>Issued to you</Ui> or on <Link href="/my-work">My work</Link> (the bell) — the sender sees that you received it.</li>
        <li><strong>Drawings</strong> lists every drawing with its latest revision and status; open one to see its PDF, history, remarks and transmittals.</li>
        <li><strong>Sent</strong> lists BOMs sent to procurement (with the Excel file) and drawing revisions issued to people.</li>
      </ol>
    ),
  },
  {
    ...topic("my-work"),
    group: "Start here",
    body: role => (
      <>
        <p>
          <Link href="/my-work">My work</Link> (the bell at the top) collects what is yours, so you don&apos;t have to look for it.
          {role !== "viewer" && <> The dashboard shows the same counts under <Ui>Your work</Ui>.</>}
        </p>
        <ul>
          <li>
            <strong>To do</strong> — what waits for you:
            {role !== "viewer"
              ? <> drawings you were asked to approve, revisions issued to you to confirm, open remarks on your drawings (the automatic DXF check&apos;s too), DXFs you checked whose title block names another sheet (confirm the file or mark it as wrong) and your BOMs built from older drawings.</>
              : <> drawing revisions issued to you to confirm.</>}
            {" "}An item leaves the list once it&apos;s done — there is nothing to tick off.
          </li>
          <li><strong>Deadlines</strong> — {role !== "viewer" && <>your drawings due in the next 14 days (late ones first) and </>}dates of the projects you manage in the next 30.</li>
          <li><strong>Updates</strong> — what others did on your work in the last 30 days: comments, status changes, remarks (including those the automatic check raised; a remark shared by several drawings shows once), revisions issued to you{role !== "viewer" && <>, DXF checks, BOMs approved or handed to you</>}. Updates since your last visit are marked <span className="mw-new">New</span>; opening My work marks them seen.</li>
          {role !== "viewer" && <li><strong>Waiting on others</strong> — your drawings sent for approval and how long they have waited.</li>}
        </ul>
        <p>The number on the bell is what needs you (to do and overdue) plus updates you haven&apos;t seen.</p>
      </>
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
        <li>Open the project and click <Ui>New BOM</Ui>. It starts as a Draft P01. (Or <Ui>Duplicate</Ui> an existing BOM from the builder, or pick <Ui>From file</Ui> to build it from the BOM template — see below.)</li>
        <li>In the <Link href="/builder">BOM Builder</Link>, add lines by searching the catalog, or with <Ui>Import</Ui> from the BOM template. Group lines into sections such as “Fire alarm” or “IT network”.</li>
        <li>Link the drawings the BOM is built from with <Ui>Manage</Ui> on the drawings strip — they are linked at their current revision.</li>
        <li>Click <Ui>Commit revision</Ui>. The lines lock.</li>
        <li>Click <Ui>Preview</Ui> to check the document, then <Ui>Generate Excel</Ui> to download it, or <Ui>Send to procurement</Ui> to email it.</li>
        <li>When the client confirms the BOM, click <Ui>Change status</Ui> → <Ui>Approved</Ui> and say who confirmed it.</li>
        <li>Something changed later? Click <Ui>New revision</Ui>: P02 starts as a draft copy of P01.</li>
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
        <p>A BOM keeps every version as a revision: P01, P02, P03… When the client approves a revision it becomes <span className="mono">C01</span> (a draft opened on top of it becomes C02), and every later revision continues C02, C03… — once a BOM has a C revision it doesn&apos;t go back to P, even if the approval is taken back. Only a <strong>Draft</strong> can be edited, and a BOM has at most one draft at a time. Committing locks the lines; after that the revision only changes status — see <a href="#bom-statuses">BOM statuses</a>.</p>
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
        <p>The drawings strip at the top of the builder shows which drawing revisions the current BOM revision was built from, e.g. <span className="pill"><span className="mono">ELV-101</span> P02</span>.</p>
        <ul>
          <li>Link and unlink drawings with <Ui>Manage</Ui> — only on a Draft. A drawing is linked at its latest revision.</li>
          <li><strong>Red</strong> — outdated: the drawing has a newer revision that changes the BOM, e.g. <span className="pill help-pill-red"><span className="mono">ELV-101</span> P02 → P03</span>.</li>
          <li><strong>✓ P03</strong> — the drawing has newer revisions, but none of them changes the BOM, or someone checked them.</li>
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
          <li><Ui>Update to P03</Ui> — on a Draft, moves the link to the newer drawing revision. Adjust the lines if needed, then commit.</li>
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
          <li>If you are looking at a draft, the button sends the latest committed revision — its number is shown on the button.</li>
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
        <li>On <Link href="/drawings">Drawings</Link>, click <Ui>New drawing</Ui>: project, name, owner and due date. The code is made from the name — its initials and the next free number in the project, e.g. <span className="mono">GFCL-001</span> for &ldquo;Ground floor CCTV layout&rdquo;. Add the <Ui>File location</Ui> — the folder on the file server, e.g. <span className="mono">2026/BMW/CCTV</span> — so others can find the files. It starts at P01, In Progress.</li>
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
        <p>A drawing keeps every issue as a revision, labelled as in the drawing standard (NAMING §6): <span className="mono">P01</span>, <span className="mono">P02</span>… while it is preliminary. The revision the client approves (Approved A, Approved B or As Built) becomes <span className="mono">C01</span>, and every later revision is <span className="mono">C02</span>, <span className="mono">C03</span>… — a drawing never goes back to P, even if the approval is taken back. Transmittals and PDFs keep the label they went out under: a P02 sent for review stays P02 in the history. The page shows the latest revision; older ones are listed under <Ui>Revisions</Ui> with their history.</p>
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
    ...topic("drawing-bulk"),
    group: "Drawings",
    roles: EDITORS,
    body: () => (
      <>
        <p>On <Link href="/drawings">Drawings</Link>, tick the drawings to change — the box in the header ticks every drawing shown, and shift-click ticks a range. A bar appears under the list with <Ui>Change status</Ui>, <Ui>Change owner</Ui> and <Ui>Change due date</Ui>, and <Ui>Shared remark</Ui> and <Ui>Shared time</Ui> to write one remark or one time entry for all of them — see <a href="#drawing-shared">below</a>.</p>
        <ul>
          <li>Each drawing follows the same rules as changing it on its own page. Before you save, the dialog says how many will change and lists the ones that won&apos;t, with the reason — e.g. Approved A before the internal check, or an owner who is approving the drawing.</li>
          <li><Ui>Need to be approved</Ui> asks one engineer to approve all of them; drawings that engineer owns are skipped. The approving engineer can approve many at once with <Ui>Awaiting approval</Ui>, or send them back with a comment.</li>
          <li>Everyone following the drawings gets one email that lists them, not one email per drawing.</li>
          <li>Every change is recorded in each drawing&apos;s history. Drawings that weren&apos;t changed stay ticked, so you can deal with them next.</li>
          <li>Codes aren&apos;t edited here — a drawing gets its code from its name when it is created.</li>
        </ul>
        <p>Changing the filters or the status tab clears the ticks.</p>
      </>
    ),
  },
  {
    ...topic("drawing-shared"),
    group: "Drawings",
    roles: EDITORS,
    body: () => (
      <>
        <p>When several drawings have the same problem, or you worked on several at once, tick them on <Link href="/drawings">Drawings</Link> (at least 2) and use <Ui>Shared remark</Ui> or <Ui>Shared time</Ui> in the bar under the list. Either one is saved for all the drawings or — if one of them was archived meanwhile — for none.</p>
        <p><strong>Shared remark</strong></p>
        <ul>
          <li>Each drawing gets its own remark on its latest revision, with the same text and source (client, site or internal). The drawings may be in different projects.</li>
          <li>On a drawing&apos;s <Ui>Remarks</Ui> card it is marked <Ui>Shared · 4 drawings</Ui> and lists the other drawings, each open or resolved.</li>
          <li>Each drawing resolves its remark on its own, when its revision fixes it — resolving it on one leaves the others open. Open remark counts, My work and the bell count it once per drawing, like any remark.</li>
        </ul>
        <p><strong>Shared time</strong></p>
        <ul>
          <li>For drawings of <strong>one project</strong> only, so the project total stays clear. Hours and date follow the usual rules: more than 0, at most 24, not in the future.</li>
          <li>The hours are logged <strong>once</strong> and not split. Each drawing&apos;s <Ui>Time</Ui> card shows them under <Ui>Shared entries</Ui> and as <Ui>Shared</Ui> next to <Ui>Logged</Ui> — they don&apos;t count in the drawing&apos;s Logged hours or against its estimate.</li>
          <li>The project&apos;s hours and the overall total on the dashboard and in the reports add each shared entry once: 5 h on four drawings adds 5 h, not 20. The owner and discipline breakdowns show each drawing&apos;s own hours only.</li>
          <li>You can still log your own hours on any of the drawings, on the same revision or a later one. If you already have shared time on that revision that day, <Ui>Log time</Ui> reminds you, so the same hours aren&apos;t logged twice.</li>
          <li>Removing a shared entry (your own, or any as an admin) removes it from every drawing at once; the dialog lists them.</li>
        </ul>
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
          <li>PDF only, up to {MAX_DRAWING_FILE_MB} MB. Whatever the file was called, it is saved and downloaded as <span className="mono">CODE_C01.pdf</span> (the revision it was uploaded under); the original name is shown next to it.</li>
          <li>A new upload replaces the current PDF. The old one is kept in the archive and the revision history says who replaced it. An admin can remove a wrong PDF, with a reason.</li>
          {role !== "viewer" && <li>Earlier revisions keep their PDFs — open them under <Ui>Revisions</Ui>.</li>}
        </ul>
      </>
    ),
  },
  {
    ...topic("drawing-check"),
    group: "Drawings",
    body: role => (
      <>
        <p>The checker reads a DXF of a drawing and compares it with the company standards — the file name (NAMING), the title block, the legend, blocks, layers and units (DRAFTING). It is advice: it blocks no status change, and uploading a DXF is never required.</p>
        {role === "viewer" ? (
          <p>You see what it found as remarks from <Ui>Automatic check</Ui> on the drawing&apos;s Remarks card.</p>
        ) : (
          <ol className="help-steps">
            <li>Save the drawing as DXF (in AutoCAD <Ui>SAVEAS</Ui> → AutoCAD 2018 DXF) and name it by the standard, e.g. <span className="mono">INS-26TGT-ZZ-00-FA-102.dxf</span>. A DWG can&apos;t be checked, even renamed to .dxf.</li>
            <li>On the drawing&apos;s <Ui>Automatic DXF check</Ui> card, click <Ui>Check a DXF</Ui> — any editor can, on the latest revision, in any status. Up to {MAX_DXF_MB} MB.</li>
            <li>The card shows <Ui>Checking</Ui> and fills in by itself when the result arrives — usually within a minute. <Ui>All findings</Ui> lists everything, with what was found and how to fix it.</li>
            <li>Fix the drawing, start a new revision if needed, and check the new DXF.</li>
          </ol>
        )}
        <ul>
          <li>Each broken rule becomes <strong>one remark</strong> per drawing, however many places break it. <Ui>Error</Ui> findings are remarks; <Ui>To check</Ui> findings are remarks marked to check, because some checks are guesses; <Ui>Info</Ui> findings stay in the report.</li>
          <li>Checking again doesn&apos;t repeat remarks: one that is still broken is updated, one whose rule now passes closes by itself in the checked revision. Rules that are switched off, or couldn&apos;t be checked in that file (no title block, a file name the standard can&apos;t read), leave their remarks as they are.</li>
          <li>You can resolve an automatic remark by hand. If the next check still finds the problem, it raises a new one.</li>
          {role !== "viewer" && <li><strong>False error.</strong> When the check is wrong about a drawing, tick <Ui>False error</Ui> while resolving its remark and say why. That rule then isn&apos;t checked on that drawing any more; the card lists it under <Ui>False errors</Ui>, and only an admin can have it checked again.</li>}
          <li>Projects that use the client&apos;s own file naming (NAMING §1) skip the file-name rules; the title block and the drawing are still checked.</li>
          <li>The DXF is deleted once it has been checked; its name, size, SHA-256 and the result stay. Owners see the remarks in <Link href="/my-work">My work</Link>.</li>
          <li>If the checker can&apos;t read the file or doesn&apos;t answer, the check fails with the reason and no remark changes.</li>
          {role === "admin" && <li>Turn checks on or off in <Link href="/settings/drawings">Settings → Drawings</Link>. They are off until they have been tried on real drawings. Which rules run and with what values: <Link href="/settings/drawing-checks">DXF check settings</Link>.</li>}
        </ul>
      </>
    ),
  },
  {
    ...topic("drawing-check-settings"),
    group: "Drawings",
    roles: EDITORS,
    body: role => (
      <>
        <p>What the automatic DXF check looks for is set by admins in {role === "admin" ? <Link href="/settings/drawing-checks">Settings → Drawings → DXF check settings</Link> : <>Settings → Drawings → DXF check settings</>}. The defaults are the standards&apos; own values (NAMING 0.0.3, DRAFTING 0.0.5).</p>
        <ul>
          <li><strong>Rules.</strong> Each of the 60 rules, in 12 groups, can be switched off — alone or with its group — and given another severity: <Ui>Error</Ui> and <Ui>To check</Ui> become remarks, <Ui>Info</Ui> only shows in the report. A rule that is off, or lowered to Info, leaves its open remarks as they are.</li>
          <li><strong>Parameters.</strong> The codes a file name may use (originators, zones, floors, systems, series), forbidden words and date formats, how the title block is found and which tags its fields have, and the drawing values — units, the legend layer, cable layers, approved blocks, model codes, typical floors. Patterns are checked when saved, and a value that isn&apos;t valid is not stored.</li>
          <li><strong>Versions.</strong> Every save is a new version and goes to the audit log. A change applies to the next check without a deploy; each check remembers the version it ran with (shown under <Ui>All findings</Ui>).</li>
          <li><strong>Client file naming.</strong> On a project whose client has its own naming (NAMING §1), an admin turns off the three file-name groups — on the project page or in the settings.</li>
          <li><strong>False errors.</strong> Listed in the settings and on each drawing&apos;s check card; an admin removes one to check that rule on that drawing again.</li>
          {role === "admin" && <li><Ui>Export rules.yaml</Ui> downloads the settings in the drawing-standard-checker skill&apos;s format, so the skill can be kept in line with Revline. Rules that are off are listed at the top as a comment.</li>}
        </ul>
      </>
    ),
  },
  {
    ...topic("drawing-sheet-code"),
    group: "Drawings",
    roles: EDITORS,
    body: () => (
      <>
        <p>File names follow the standard: <span className="mono">INS-26TGT-ZZ-00-FA-102_P01.dxf</span> — originator, project code, then zone, floor, system and number. Those last four, <span className="mono">ZZ-00-FA-102</span>, are the drawing&apos;s <strong>sheet code</strong>. The same sheet code appears in many projects, so it is unique only within one.</p>
        <ul>
          <li>The first DXF with a standard name checked on a drawing gives it its sheet code. You can also type it, or change it, with <Ui>Edit</Ui> — but the standard lets a sheet be renumbered only until it is first issued: once the drawing has a transmittal, <strong>only an admin</strong> changes or clears its sheet code (the change is marked in the audit log). A drawing issued before it had one can still be given its first.</li>
          <li>From then on a DXF goes to a drawing only if its name carries <strong>exactly that sheet code</strong> and <strong>the drawing&apos;s project code</strong>. A file named for another sheet or another project is refused before it is uploaded. A name that doesn&apos;t follow the standard is your call.</li>
          <li>A renamed file passes by its name but not by its title block. When the result comes in, the sheet number in the title block is compared with the sheet code:
            <ul>
              <li><strong>It matches</strong> — remarks are written and fixed ones close, as usual.</li>
              <li><strong>It names another sheet</strong> — nothing changes. The check shows <Ui>Needs confirming</Ui> on the drawing and in the uploader&apos;s <Link href="/my-work">My work</Link>: <Ui>It&apos;s this drawing&apos;s file</Ui> applies its findings as this drawing&apos;s, <Ui>Wrong file</Ui> sets it aside.</li>
              <li><strong>It can&apos;t be read</strong> (no title block, no sheet number) — new remarks are written, but none closes by itself.</li>
              <li><strong>The drawing has no sheet code</strong> — there is nothing to compare, so new remarks are written but none closes by itself until the drawing has one. In a project with the client&apos;s file naming, fixed remarks close as usual.</li>
            </ul>
          </li>
          <li>Confirming a file or marking it as the wrong file is up to <strong>whoever uploaded it, the drawing&apos;s owner or an admin</strong>. Others see who can.</li>
          <li><Ui>Wrong file</Ui> on the latest check undoes what it did: remarks it raised are removed, remarks it closed reopen, remarks it updated get their earlier text back, and a sheet code it set is cleared — unless the drawing has been issued since, when the sheet code stays and only an admin changes it. Remarks someone changed by hand since are left alone. Only the drawing&apos;s latest check that changed remarks can be undone.</li>
        </ul>
      </>
    ),
  },
  {
    ...topic("drawing-check-bulk"),
    group: "Drawings",
    roles: EDITORS,
    body: () => (
      <>
        <ol className="help-steps">
          <li>On <Link href="/drawings">Drawings</Link>, tick the drawings the files are for (up to {MAX_BULK_DRAWINGS}) and click <Ui>Check DXFs</Ui> in the bar under the list.</li>
          <li>Drop the DXF files, or pick them. A table shows which file goes to which drawing before anything is uploaded.</li>
          <li>Click <Ui>Upload and check</Ui>. The files go up one by one; keep the page open until the list says they are all handed over. Results then arrive on each drawing like a single check.</li>
        </ol>
        <ul>
          <li>A standard name goes to the ticked drawing of its project with that sheet code. If none of them has it yet, pick the drawing — it keeps the file&apos;s sheet code. A name off the standard is always picked by hand.</li>
          <li>Left out, with the reason: another project&apos;s file, two files for one drawing or of one sheet (remove the extra one), a sheet that belongs to a drawing you didn&apos;t tick, a drawing whose check is still running, and drawings of a project that still has an old-style code like <span className="mono">BS-005</span> — an admin changes the code in the project passport first.</li>
          <li>The server checks the plan again before uploading and gives a reason for any file it leaves out.</li>
          <li>When the checker is busy, files wait their turn and are sent again automatically.</li>
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
        <li><Link href="/settings/drawings">Drawings</Link> — who gets status emails for every drawing, the daily reminders, the list of disciplines, from which status drawing PDFs can be uploaded, and the switch for automatic DXF checks; under it, <Link href="/settings/drawing-checks">DXF check settings</Link> — rules, severities, parameters, client file naming and false errors.</li>
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
