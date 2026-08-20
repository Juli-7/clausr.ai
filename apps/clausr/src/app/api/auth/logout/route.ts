import { NextResponse } from "next/server";
import { getSessionCookieOptions } from "@clausr/platform-core";

export async function POST() {
  const cookieOpts = getSessionCookieOptions();
  const response = NextResponse.json({ success: true });
  response.cookies.set(cookieOpts.name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
