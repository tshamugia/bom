/**
 * Where to go after signing in, from the `?next=` the proxy adds. Only paths on
 * this site are allowed, so a crafted link can't bounce a user who just signed
 * in to another site. `//host` and `/\host` are protocol-relative to browsers.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // Control characters (tab/newline) are stripped by URL parsers and can turn "/\t/evil" into "//evil".
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}
