import { TRPCError } from "@trpc/server";
import { NextResponse } from "next/server";

import { baseUrl } from "@/data/env/server";
import { api } from "@/integrations/trpc/server";

/** `?to=` picks a deep link into the portal; anything else lands on the overview. */
const DEEP_LINKS = {
  "payment-method": "updatePaymentMethod",
  cancel: "cancel",
} as const;

function isDeepLink(value: string | null): value is keyof typeof DEEP_LINKS {
  return value != null && value in DEEP_LINKS;
}

/**
 * Mints a Paddle customer portal session for the signed-in user's active
 * organization and sends the browser there. Paddle hosts the portal:
 * payment method, invoices, cancellation all happen on their side.
 *
 * Everything that matters is resolved server-side through the tRPC
 * caller: the session cookie identifies the user, the org comes from
 * that session, and the Paddle customer id from the org row — nothing
 * about *whose* portal to open is taken from the request. Sessions are
 * short-lived, so the URL is minted on every visit rather than stored.
 * A plain link (not a click → mutation → `window.open`) so popup
 * blockers never eat the redirect.
 */
export async function GET(request: Request) {
  const to = new URL(request.url).searchParams.get("to");

  let urls: Awaited<
    ReturnType<Awaited<ReturnType<typeof api>>["billing"]["portalUrl"]>
  >;
  try {
    const caller = await api();
    urls = await caller.billing.portalUrl();
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      return NextResponse.redirect(new URL("/auth/sign-in", baseUrl));
    }
    // Not an admin, no subscription, or Paddle itself is down: the billing
    // page already explains the first two; the banner covers the last.
    console.warn("[paddle] customer portal session not created", error);
    return NextResponse.redirect(
      new URL("/settings/billing?portal=unavailable", baseUrl),
    );
  }

  const target =
    (isDeepLink(to) ? urls[DEEP_LINKS[to]] : null) ?? urls.overview;
  return NextResponse.redirect(target);
}
