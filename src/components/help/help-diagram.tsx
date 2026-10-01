import { Icon } from "@/components/icons";

function Node({
  icon,
  title,
  sub,
  chain,
  out = false,
}: {
  icon?: React.ReactNode;
  title: string;
  sub: string;
  chain?: string[];
  out?: boolean;
}) {
  return (
    <div className={out ? "hd-node hd-out" : "hd-node"}>
      <div className="hd-title">{icon}{title}</div>
      {chain && (
        <div className="hd-chain" aria-label={chain.join(", ")}>
          {chain.map((c, i) => (
            <span key={c} className={i === chain.length - 1 ? "now" : undefined}>{c}</span>
          ))}
        </div>
      )}
      <div className="hd-sub">{sub}</div>
    </div>
  );
}

const Down = () => <div className="hd-down" aria-hidden>↓</div>;

/**
 * Project → drawings and BOMs, and the "built from" link between a BOM
 * revision and drawing revisions. Stacks on phones, two columns on wider screens.
 */
export function HelpDiagram() {
  return (
    <figure className="hd" aria-label="How projects, drawings and BOMs are connected">
      <div className="hd-project">
        <div className="hd-title"><Icon.Folder className="ico" aria-hidden />Project</div>
        <div className="hd-sub">Passport, contacts, milestones and disciplines. Everything below belongs to one project.</div>
      </div>

      <div className="hd-cols">
        <div className="hd-col">
          <div className="hd-col-label">Drawings</div>
          <Node
            icon={<Icon.Drawing className="ico" aria-hidden />}
            title="Drawing"
            sub="Code, owner, discipline, due date"
          />
          <Down />
          <Node
            title="Drawing revisions"
            chain={["rev1", "rev2", "rev3"]}
            sub="Status, internal check, “changes the BOM?”"
          />
          <Down />
          <Node
            out
            icon={<Icon.Send className="ico" aria-hidden />}
            title="Transmittals"
            sub="Revision issued to people → Sent"
          />
        </div>

        <div className="hd-link">
          <span className="hd-link-line" aria-hidden />
          <span className="hd-link-label">
            <Icon.Link className="ico" aria-hidden /> built from
          </span>
          <span className="hd-link-sub">
            A BOM revision remembers the drawing revisions it was built from. A newer drawing revision that changes
            the BOM marks it outdated.
          </span>
        </div>

        <div className="hd-col">
          <div className="hd-col-label">BOMs</div>
          <Node
            icon={<Icon.List className="ico" aria-hidden />}
            title="BOM"
            sub="Bill of materials, e.g. “Fire alarm”"
          />
          <Down />
          <Node
            title="BOM revisions"
            chain={["Rev A", "Rev B"]}
            sub="Lines from the item catalog (items → vendors)"
          />
          <Down />
          <Node
            out
            icon={<Icon.Sheet className="ico" aria-hidden />}
            title="Excel and procurement"
            sub="Excel file, emailed to procurement → Sent"
          />
        </div>
      </div>
    </figure>
  );
}
