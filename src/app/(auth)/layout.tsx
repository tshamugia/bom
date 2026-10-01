import { Icon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Left brand panel (dark, mirrors the app sidebar) ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--sb-bg)] p-10 text-[var(--sb-text)] lg:flex">
        {/* brand */}
        <div className="relative flex items-center gap-3">
          <div className="sb-logo" style={{ width: 38, height: 38, fontSize: 16 }}>B</div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-[var(--sb-text)]">BOM Studio</div>
            <div className="text-[12px] text-[var(--sb-text-3)]">Insta</div>
          </div>
        </div>

        {/* headline + features */}
        <div className="relative max-w-[420px]">
          <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
            Every bill of materials,
            <br />
            under control.
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--sb-text-2)]">
            Build, review and export procurement-ready BOMs from a single, versioned workspace.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              { icon: <Icon.List className="ico" />, text: "Build BOMs from a live component catalog" },
              { icon: <Icon.Sheet className="ico" />, text: "Preview and export to Excel in one click" },
              { icon: <Icon.CheckCircle className="ico" />, text: "Send to procurement with a full audit trail" },
            ].map((f, i) => (
              <li key={i} className="flex items-center gap-3 text-[13.5px] text-[var(--sb-text)]">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[var(--r-2)] border border-[var(--sb-line)] bg-white/5 text-[var(--sb-text-2)]">
                  {f.icon}
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        {/* footer */}
        <div className="relative text-[12px] text-[var(--sb-text-3)]">
          Single-tenant workspace · Accounts provisioned by an administrator.
        </div>
      </aside>

      {/* ── Right form area ── */}
      <div className="relative grid place-items-center overflow-hidden bg-[var(--color-bg)] p-6 max-[480px]:p-4">
        <div className="relative w-full max-w-sm">
          <div
            className="relative overflow-hidden rounded-[var(--r-4)] border border-[var(--color-line)] bg-[var(--color-surface)] p-7 max-[480px]:p-5"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            {/* top accent bar */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
              style={{ background: "var(--accent)" }}
            />

            {/* compact brand (mirrors sidebar; primary brand on mobile) */}
            <div className="mb-6 flex items-center gap-2.5">
              <div className="sb-logo" style={{ width: 34, height: 34 }}>B</div>
              <div className="leading-tight">
                <div className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">BOM Studio</div>
                <div className="text-[11px] text-[var(--color-text-3)]">Insta</div>
              </div>
            </div>

            {children}
          </div>

          <p className="mt-4 text-center text-[12px] text-[var(--color-text-3)]">
            Accounts are provisioned by your workspace administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
