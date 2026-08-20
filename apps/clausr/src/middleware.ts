import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/send-code",
  "/api/auth/login-code",
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/images/",
  "/fonts/",
  "/api/compliance/regulation",
  "/share/",
  "/api/compliance/share/",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|fonts/).*)",
  ],
};
