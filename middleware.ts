import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authConfig, verifySessionToken } from "@/lib/auth";

/**
 * Every route is private. The gate sits here rather than in each page so a new
 * page is protected by default instead of by remembering to protect it.
 *
 * Fails closed: if AUTH_SECRET or the passcode is missing, nothing is served.
 * An app that cannot authenticate should refuse, not open.
 */
export async function middleware(request: NextRequest) {
  const { secret, ready } = authConfig();

  if (!ready) {
    return new NextResponse(
      "Authentication is not configured. Set AUTH_SECRET and FITNESS_WRITE_PASSCODE.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, secret)) return NextResponse.next();

  // An API call gets a status it can act on; a page gets the login screen.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login screen, the endpoint that grants a session,
  // and Next's own static output.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
