import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[13px] shadow-[var(--shadow-card)] transition-[border-color,box-shadow] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--color-text-4)] hover:border-[var(--color-line-strong)] focus-visible:border-[var(--color-accent)] focus-visible:ring-3 focus-visible:ring-[var(--color-accent-soft)] focus-visible:hover:border-[var(--color-accent)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
