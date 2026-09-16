import { Icon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Left brand panel (dark, mirrors the app sidebar) ── */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-[var(--sb-text)] lg:flex"
        style={{
          background: "var(--sb-bg)",
          backgroundImage:
            "radial-gradient(900px 500px at -5% -10%, rgba(138,92,255,0.28), transparent 60%)," +
            "radial-gradient(760px 420px at 110% 8%, rgba(85,98,255,0.26), transparent 62%)," +
            "radial-gradient(700px 500px at 90% 115%, rgba(138,92,255,0.18), transparent 65%)",
        }}
      >
        {/* faint grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.6]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(120% 120% at 30% 0%, rgba(0,0,0,0.8), transparent 75%)",
            WebkitMaskImage: "radial-gradient(120% 120% at 30% 0%, rgba(0,0,0,0.8), transparent 75%)",
          }}
        />

        {/* brand */}
        <div className="relative flex items-center gap-3">
          <div className="sb-logo" style={{ width: 38, height: 38, fontSize: 16 }}>B</div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-[var(--sb-text)]">BOM Studio</div>
            <div className="text-[12px] text-[var(--sb-text-3)]">Halcyon Robotics</div>
          </div>
        </div>

        {/* headline + features */}
        <div className="relative max-w-[420px]">
          <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
            Every bill of materials,
            <br />
            <span
              style={{
                backgroundImage: "linear-gradient(90deg, #b9bfff 0%, #d9c5ff 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              under control.
            </span>
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
                <span
                  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-[#c9ccff]"
                  style={{ background: "rgba(255,255,255,0.06)", boxShadow: "inset 0 0 0 1px rgba(138,135,255,0.18)" }}
                >
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
      <div className="relative grid place-items-center overflow-hidden bg-[var(--color-bg)] p-6">
        {/* subtle color wash (visible on small screens where the left panel is hidden) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 15% 5%, rgba(85,98,255,0.10), transparent 60%)," +
              "radial-gradient(55% 45% at 90% 100%, rgba(138,92,255,0.10), transparent 65%)",
          }}
        />

        <div className="relative w-full max-w-sm">
          <div
            className="relative overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-7"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            {/* top accent bar */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
              style={{ background: "var(--accent-grad)" }}
            />

            {/* compact brand (mirrors sidebar; primary brand on mobile) */}
            <div className="mb-6 flex items-center gap-2.5">
              <div className="sb-logo" style={{ width: 34, height: 34 }}>B</div>
              <div className="leading-tight">
                <div className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">BOM Studio</div>
                <div className="text-[11px] text-[var(--color-text-3)]">Halcyon Robotics</div>
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
