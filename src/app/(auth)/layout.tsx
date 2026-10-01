import { LogoMark } from "@/components/brand/logo-mark";
import { Icon } from "@/components/icons";
import { BRAND_COMPANY, BRAND_NAME } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Left brand panel (dark, mirrors the app sidebar) ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--sb-bg)] p-10 text-[var(--sb-text)] lg:flex">
        {/* brand */}
        <div className="relative flex items-center gap-3">
          <LogoMark size={38} />
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-[var(--sb-text)]">{BRAND_NAME}</div>
            <div className="text-[12px] text-[var(--sb-text-3)]">{BRAND_COMPANY}</div>
          </div>
        </div>

        {/* headline + features */}
        <div className="relative max-w-[420px]">
          <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
            Every drawing and BOM,
            <br />
            revision by revision.
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--sb-text-2)]">
            Take drawings through approval, build BOMs from them and send both on — with a record of every change.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              { icon: <Icon.Drawing className="ico" />, text: "Drawing revisions, approvals and PDFs" },
              { icon: <Icon.List className="ico" />, text: "BOMs built from the drawings and a live catalog" },
              { icon: <Icon.Send className="ico" />, text: "Sent to procurement and site with a full audit trail" },
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
              <LogoMark size={34} />
              <div className="leading-tight">
                <div className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">{BRAND_NAME}</div>
                <div className="text-[11px] text-[var(--color-text-3)]">{BRAND_COMPANY}</div>
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
