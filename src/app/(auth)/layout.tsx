export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-accent)] text-xs font-bold text-white">B</div>
          <div className="font-semibold tracking-tight">BOM Studio</div>
        </div>
        {children}
      </div>
    </div>
  );
}
