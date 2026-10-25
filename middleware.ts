import { NextResponse, type NextRequest } from "next/server";

// Presence check only; real verification happens in route handlers.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("wsp_session")) return NextResponse.redirect(new URL("/login", req.url));
}
export const config = { matcher: ["/", "/groups/:path*", "/spending", "/profile", "/settings"] };
