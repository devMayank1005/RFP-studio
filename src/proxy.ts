import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection.
 *
 * Next 16 renamed `middleware` to `proxy` — this file must be `proxy.ts` with a
 * `proxy` export, and it runs on the Node runtime.
 *
 * This is an OPTIMISTIC check only: it looks for the session cookie so
 * signed-out visitors are redirected without a database round trip on every
 * request. The authoritative check — is the session real, which workspace,
 * which role — happens in the (app) layout via requireSession(). Never treat a
 * cookie's presence as proof of a valid session.
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = getSessionCookie(request);

  if (!hasSessionCookie) {
    const signIn = new URL("/sign-in", request.url);
    // Path AND query: a shared "everything flagged in Payroll" link must survive the bounce.
    signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/rfps/:path*", "/quick/:path*", "/kb/:path*", "/settings/:path*"],
};
