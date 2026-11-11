import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { HelpTip } from "@/components/help/help-tip";
import { BlockedNote } from "@/components/help/blocked-note";
import { CheckRulesForm } from "@/components/drawings/check-settings/check-rules-form";
import { CheckParamsForm } from "@/components/drawings/check-settings/check-params-form";
import { ClientNamingProjects } from "@/components/drawings/check-settings/client-naming-projects";
import { CheckWaivers } from "@/components/drawings/check-waivers";
import { getDrawingCheckSettingsPage } from "@/server/queries/drawing-checks";
import { requireSession } from "@/server/auth-context";
import { isAdmin } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";
import { CHECK_PARAMS, CHECK_PARAM_SECTIONS, paramValue } from "@/lib/drawing-check-params";
import { enabledCheckRules } from "@/lib/drawing-checks";
import { CHECK_RULE_IDS } from "@/lib/drawing-check-rules";

/**
 * Settings → Drawings → DXF check settings (issue #18, stage 3): which rules
 * the automatic DXF check runs and with what values. Admins only.
 */
export default async function DrawingCheckSettingsPage() {
  const session = await requireSession();
  if (!isAdmin(session.user)) redirect("/settings");
  const { enabled, configured, config, projects, waivers } = await getDrawingCheckSettingsPage();
  const running = enabledCheckRules(config.rules).length;

  return (
    <div className="page-narrow">
      <PageHead
        back={{ href: "/settings/drawings", label: "Drawings" }}
        title={<span className="inline-flex items-center gap-1.5">DXF check settings <HelpTip topic="drawing-check-settings" /></span>}
        subtitle="Which rules the automatic DXF check runs, how severe each one is, and the values from the standards it checks against."
        actions={
          <a href="/api/drawing-checks/rules.yaml" download className="w-full">
            <Button variant="outline" className="w-full"><Icon.Download size={14} className="mr-1.5" /> Export rules.yaml</Button>
          </a>
        }
      />

      <div className="grid gap-5">
        <div className="grid gap-2">
          <p className="m-0 text-[12.5px] text-[var(--color-text-2)]">
            {config.version === 0
              ? "Version 0 — the standard's values, nothing changed yet."
              : `Version ${config.version} — saved ${config.updatedAt ? formatDateTime(config.updatedAt) : ""}${config.updatedByName ? ` by ${config.updatedByName}` : ""}.`}
            {" "}{running} of {CHECK_RULE_IDS.length} rules run. A change applies to the next check; finished checks keep the version they ran with.
          </p>
          {!enabled && (
            <BlockedNote topic="drawing-check">
              Automatic checks are off — nothing is checked until they are turned on in <Link href="/settings/drawings" className="underline">Settings → Drawings</Link>.
            </BlockedNote>
          )}
          {enabled && !configured && (
            <BlockedNote topic="drawing-check">
              The checker isn&apos;t connected to this server, so patterns are only checked here, not by the checker itself.
            </BlockedNote>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Rules</h3>
              <p className="card-sub">
                Error and To check findings become remarks; Info findings only show in the report. A rule that is off — by itself or with its group — leaves its open remarks as they are.
              </p>
            </div>
          </div>
          <CheckRulesForm key={config.version} version={config.version} initial={config.rules} />
        </div>

        {CHECK_PARAM_SECTIONS.map(s => (
          <div key={s.id} className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">{s.label}</h3>
                <p className="card-sub">{s.sub}</p>
              </div>
            </div>
            <CheckParamsForm
              key={config.version}
              section={s.id}
              version={config.version}
              values={Object.fromEntries(CHECK_PARAMS.filter(p => p.section === s.id).map(p => [p.id, paramValue(config.params, p)]))}
            />
          </div>
        ))}

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Client file naming</h3>
              <p className="card-sub">
                NAMING §1: where the client&apos;s naming applies, checks of the project&apos;s drawings skip the file name, its codes and its revision. Also on each project&apos;s page.
              </p>
            </div>
          </div>
          <ClientNamingProjects projects={projects} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">False errors</h3>
              <p className="card-sub">
                Rules someone closed as a false error on a drawing: checks of that drawing don&apos;t run them. Remove one to check the rule there again.
              </p>
            </div>
          </div>
          {waivers.length ? (
            <CheckWaivers waivers={waivers} canRemove showDrawing />
          ) : (
            <p className="muted m-0 px-4 pb-4 text-[12.5px]">No false errors.</p>
          )}
        </div>
      </div>
    </div>
  );
}
