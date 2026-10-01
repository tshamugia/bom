import { toast as sonner, type ExternalToast } from "sonner";

type Show = typeof sonner.error;

/**
 * Errors, warnings and notices stay on screen until the user closes them, so
 * there is time to read what went wrong. The same text again replaces the open
 * toast instead of stacking a copy.
 */
function sticky(show: Show, kind: string): Show {
  return (message, data?: ExternalToast) =>
    show(message, {
      duration: Infinity,
      id: typeof message === "string" ? `${kind}:${message}` : undefined,
      ...data,
    });
}

/**
 * The app's toast — import it from here, not from "sonner". Success toasts
 * close on their own; everything else waits for the close button.
 */
export const toast = Object.assign(
  (...args: Parameters<typeof sonner>) => sonner(...args),
  sonner,
  {
    error: sticky(sonner.error, "error"),
    warning: sticky(sonner.warning, "warning"),
    info: sticky(sonner.info, "info"),
  },
);
