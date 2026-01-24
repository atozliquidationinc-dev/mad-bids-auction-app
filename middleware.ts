import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow API + Next assets (important!)
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  ) {
    return NextResponse.next();
  }

  // If you use a cookie to store "unlocked", check it here
  const unlocked = req.cookies.get("madbids_unlocked")?.value === "1";

  // Allow landing page to be accessible
  if (pathname === "/") return NextResponse.next();

  // If not unlocked, redirect to landing
  if (!unlocked) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Apply middleware to everything EXCEPT api/_next/etc (extra safety)
export const config = {
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};
