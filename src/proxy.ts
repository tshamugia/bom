import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PROTECTED = ["/dashboard", "/builder", "/preview", "/catalog", "/vendors", "/approvals", "/history", "/users", "/projects", "/settings"];

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
    "/projects/:path*",
    "/settings/:path*",
  ],
};
