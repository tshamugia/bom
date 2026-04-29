import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/builder", "/preview", "/catalog", "/vendors", "/approvals", "/history"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!PROTECTED.some(p => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies.get("better-auth.session_token");
  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/builder/:path*", "/preview/:path*", "/catalog/:path*", "/vendors/:path*", "/approvals/:path*", "/history/:path*"],
};
