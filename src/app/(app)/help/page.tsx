import type { Metadata } from "next";
import { requireSession } from "@/server/auth-context";
import { roleOf } from "@/lib/roles";
import { PageHead } from "@/components/master/page-head";
import { HELP_GROUPS, sectionsFor } from "@/components/help/help-sections";

export const metadata: Metadata = { title: "Help — BOM Studio" };

export default async function HelpPage() {
  const session = await requireSession();
  const role = roleOf(session.user);
  // Each role only reads about what it can do; the (?) tips link to these anchors.
  const sections = sectionsFor(role);
  const groups = HELP_GROUPS
    .map(group => ({ group, sections: sections.filter(s => s.group === group) }))
    .filter(g => g.sections.length > 0);

  const toc = (
    <ul className="help-toc-list">
      {groups.map(g => (
        <li key={g.group}>
          <div className="help-toc-group">{g.group}</div>
          <ul>
            {g.sections.map(s => (
              <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHead
        title="Help"
        subtitle="How BOM Studio works — what connects to what, and how to get the common jobs done. Look for the (?) next to a rule in the app for the short version."
      />
      <div className="help-layout">
        <details className="card help-toc-mobile">
          <summary>Contents</summary>
          {toc}
        </details>

        <div className="help-body">
          {groups.map(g => (
            <div key={g.group} className="help-group">
              <h2 className="help-group-title">{g.group}</h2>
              {g.sections.map(s => (
                <section key={s.id} id={s.id} className="card help-section" aria-labelledby={`${s.id}-title`}>
                  <div className="card-head">
                    <h3 id={`${s.id}-title`} className="card-title">{s.title}</h3>
                  </div>
                  <div className="help-prose">{s.body(role)}</div>
                </section>
              ))}
            </div>
          ))}
        </div>

        <nav className="card help-toc" aria-label="Help contents">{toc}</nav>
      </div>
    </>
  );
}
