// Where the proxy sends a viewer who opens a page outside their status-only
// app. Pure (no server imports) so it can be unit-tested.

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/**
 * Editing surfaces send viewers to the read-only page with the same data;
 * master data and edit history send them home. `null` = the page is theirs.
 */
export function viewerRedirect(path: string): string | null {
  if (under(path, "/builder")) return `/preview${path.slice("/builder".length)}`;
  if (under(path, "/catalog") || under(path, "/vendors") || under(path, "/history")) return "/dashboard";
  const projectHistory = path.match(/^\/projects\/([^/]+)\/(history|diff)(\/|$)/);
  if (projectHistory) return `/projects/${projectHistory[1]}`;
  return null;
}
