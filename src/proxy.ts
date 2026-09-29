import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";

const PROTECTED = ["/dashboard", "/builder", "/preview", "/catalog", "/vendors", "/approvals", "/history", "/users", "/audit", "/projects", "/settings", "/drawings", "/reports"];

/** Editing surfaces a viewer is sent away from, to the read-only page that shows the same data. */
function viewerRedirect(path: string): string | null {
  if (path === "/builder" || path.startsWith("/builder/")) return `/preview${path.slice("/builder".length)}`;
  if (path === "/catalog/import" || path.startsWith("/catalog/import/")) return "/catalog";
  return null;
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!PROTECTED.some(p => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const target = canEdit(session.user) ? null : viewerRedirect(path);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/builder/:path*",
    "/preview/:path*",
    "/catalog/:path*",
    "/vendors/:path*",
    "/approvals/:path*",
    "/history/:path*",
    "/users/:path*",
    "/audit/:path*",
    "/projects/:path*",
    "/settings/:path*",
    "/drawings/:path*",
    "/reports/:path*",
  ],
};
