export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--color-bg)] p-6">
      {/* Color wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "radial-gradient(60% 55% at 18% 12%, rgba(99,102,241,0.22), transparent 60%)," +
            "radial-gradient(55% 50% at 88% 18%, rgba(124,58,237,0.20), transparent 65%)," +
            "radial-gradient(70% 60% at 80% 95%, rgba(13,148,136,0.16), transparent 70%)," +
            "radial-gradient(60% 55% at 10% 100%, rgba(217,119,6,0.14), transparent 70%)",
        }}
      />
      {/* Aurora streak */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 blur-3xl"
        style={{
          backgroundImage:
            "linear-gradient(110deg, rgba(99,102,241,0.0) 0%, rgba(99,102,241,0.35) 30%, rgba(168,85,247,0.32) 55%, rgba(14,165,233,0.30) 80%, rgba(99,102,241,0.0) 100%)",
          maskImage:
            "radial-gradient(80% 100% at 50% 0%, rgba(0,0,0,0.85), transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(80% 100% at 50% 0%, rgba(0,0,0,0.85), transparent 75%)",
        }}
      />
      {/* Grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--color-line-soft) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(closest-side, rgba(0,0,0,0.55), transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(closest-side, rgba(0,0,0,0.55), transparent 80%)",
        }}
      />

      <div className="w-full max-w-sm">
        <div className="relative rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-7 shadow-[0_24px_60px_-24px_rgba(67,56,202,0.35),0_2px_6px_rgba(15,18,34,0.06),0_0_0_1px_rgba(255,255,255,0.6)_inset]">
            {/* Top accent bar */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #6366f1 0%, #8b5cf6 35%, #ec4899 65%, #f59e0b 100%)",
              }}
            />

            <div className="mb-6 flex items-center gap-2.5">
              <div
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-xl text-[14px] font-bold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_4px_12px_-2px_rgba(99,102,241,0.55),0_1px_2px_rgba(15,18,34,0.18)]"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #6366f1 0%, #7c3aed 60%, #db2777 100%)",
                }}
              >
                B
              </div>
              <div className="leading-tight">
                <div className="text-[15px] font-semibold tracking-tight">BOM Studio</div>
                <div className="text-[11px] text-[var(--color-text-3)]">Bill of Materials</div>
              </div>
            </div>
          {children}
        </div>
        <p className="mt-4 text-center text-[12px] text-[var(--color-text-3)]">
          Accounts are provisioned by your workspace administrator.
        </p>
      </div>
    </div>
  );
}
