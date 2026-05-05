import Link from "next/link";
import { Icon } from "@/components/icons";

type Step = {
  label: string;
  state: "done" | "active" | "todo";
  href?: string;
};

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <div className="flex h-9 items-center gap-1 rounded-[var(--radius-3)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[12px]">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1">
          {i > 0 && <Icon.Chevron size={12} className="text-[var(--color-text-4)]" />}
          <StepBadge step={s} index={i} />
        </div>
      ))}
    </div>
  );
}

function StepBadge({ step, index }: { step: Step; index: number }) {
  const dot =
    step.state === "done" ? (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-success)] text-white">
        <Icon.Check size={10} strokeWidth={3} />
      </span>
    ) : step.state === "active" ? (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-white">
        {index + 1}
      </span>
    ) : (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-surface-3)] text-[10px] font-semibold text-[var(--color-text-3)]">
        {index + 1}
      </span>
    );

  const label = (
    <span
      className={
        step.state === "active"
          ? "font-medium text-[var(--color-text)]"
          : step.state === "done"
            ? "text-[var(--color-text-2)]"
            : "text-[var(--color-text-4)]"
      }
    >
      {step.label}
    </span>
  );

  const inner = (
    <span className="flex items-center gap-1.5 rounded-[var(--radius-2)] px-1.5 py-1">
      {dot}
      {label}
    </span>
  );

  if (step.href && step.state !== "active") {
    return (
      <Link href={step.href} className="hover:bg-[var(--color-surface-2)] rounded-[var(--radius-2)]">
        {inner}
      </Link>
    );
  }
  return inner;
}
