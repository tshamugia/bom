/**
 * The in-app page the user came from, so a "← Projects" link can step back
 * through history (keeping that page's filters and scroll) when it leads to
 * the same page anyway. ShellChrome records every pathname change.
 */
let current: string | null = null;
let previous: string | null = null;

export function recordPathname(pathname: string) {
  if (pathname === current) return;
  previous = current;
  current = pathname;
}

/** True when the previous page in this tab was `pathname`. */
export function cameFrom(pathname: string): boolean {
  return previous !== null && previous === pathname;
}
