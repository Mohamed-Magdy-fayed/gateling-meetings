import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/data/env/server";
import {
  getUserSession,
  updateUserSessionExpiration,
} from "@/features/core/auth/core";
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/integrations/security/csp";

/**
 * Pages that need a signed-in account (a meeting *host*). Everything else —
 * the landing page, `/m/[code]` (guests join by link), the auth pages — is
 * public. `/m/*` is deliberately absent: a guest must reach the pre-join
 * screen without an account, and the room itself is gated by the LiveKit
 * token the server issues, not by this list.
 */
const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/schedule",
  "/meetings",
  "/settings",
  "/admin",
];

const AUTH_ROUTE_PREFIX = "/auth";

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const nonce = createCspNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    liveKitUrl: env.LIVEKIT_URL,
  });

  const response =
    (await middlewareAuth(request, nonce)) ?? nextWithNonce(request, nonce);

  // Set on the response whatever `middlewareAuth` returned — a redirect still
  // gets the policy, so there is no path out of here without one.
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  // request.cookies reflects what the browser actually sent (the session-id
  // cookie); response.cookies only reflects what's been explicitly set on
  // this response so far (nothing, at this point). Read from the request,
  // write the refreshed cookie to the response that's actually returned.
  await updateUserSessionExpiration({
    get: (name) => request.cookies.get(name),
    set: (name, value, options) => {
      response.cookies.set(name, value, options);
    },
  });

  return response;
}

/**
 * Forwards the request with `x-nonce` attached, which is how the nonce reaches
 * the render: Next reads it out of the CSP header for its own bundles, and
 * `app/layout.tsx` reads this header for the tags it renders itself.
 */
function nextWithNonce(request: NextRequest, nonce: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

async function middlewareAuth(request: NextRequest, nonce: string) {
  const pathname = request.nextUrl.pathname;

  if (!startsWithAny(pathname, PROTECTED_PATH_PREFIXES)) {
    return nextWithNonce(request, nonce);
  }

  const session = await getUserSession(request.cookies);

  if (!session?.user) {
    const signInUrl = new URL(`${AUTH_ROUTE_PREFIX}/sign-in`, request.url);
    signInUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return nextWithNonce(request, nonce);
}

export const config = {
  matcher: [
    "/((?!api(?:/|$))(?!_next(?:/|$))(?![^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
  ],
};
