import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { baseUrl, env } from "@/data/env/server";
import { db } from "@/drizzle";
import { IntegrationsTable, SsoTokensTable } from "@/drizzle/schema";
import {
  createUserSession,
  removeUserFromSession,
} from "@/features/core/auth/core/session";
import { ensureLinkedUser } from "@/features/integrations/server/linked-users";
import { ensureSsoInvite } from "@/features/integrations/server/sso-invites";
import { findMeetingByCode } from "@/features/meetings/server/queries";
import {
  RETURN_COOKIE_NAME,
  returnCookieOptions,
  signReturnTarget,
} from "@/integrations/sso/cookie";
import { verifySsoToken } from "@/integrations/sso/token";

type ErrorReason = "expired" | "used" | "invalid";

/**
 * Where a signed `/join-links` URL lands. Verifies the token, proves the
 * meeting belongs to the integration named in it, and then either signs the
 * host in (single-use) or hands a participant an invite credential — in both
 * cases ending on the ordinary `/m/<code>` page, which needs to know nothing
 * about SSO. Never renders anything itself: every outcome is a redirect.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || !env.JWT_SECRET_KEY) return fail("invalid");

  const verified = await verifySsoToken(env.JWT_SECRET_KEY, token);
  if (!verified.ok) return fail(verified.reason);
  const claims = verified.claims;

  const integration = await db.query.IntegrationsTable.findFirst({
    where: and(
      eq(IntegrationsTable.slug, claims.aud),
      isNull(IntegrationsTable.revokedAt),
    ),
  });
  if (!integration) return fail("invalid");

  const meeting = await findMeetingByCode(db, claims.meetingCode);
  if (!meeting || meeting.integrationId !== integration.id) {
    return fail("invalid");
  }
  // The room page already knows how to say "this meeting has ended".
  if (meeting.status === "ended") {
    return NextResponse.redirect(new URL(`/m/${meeting.code}`, baseUrl));
  }

  const target = new URL(`/m/${meeting.code}`, baseUrl);
  const response = NextResponse.redirect(target);

  if (claims.role === "host") {
    if (!(await consumeHostToken(claims.jti, meeting.id))) {
      return fail("used");
    }
    const user = await ensureLinkedUser(db, integration, {
      externalId: claims.externalId,
      name: claims.name,
      email: claims.email,
    });
    if (user.id !== meeting.hostId) return fail("invalid");
    // Whoever was signed in on this browser is replaced, not layered: the
    // old session is dropped from Redis, then the new cookie overwrites it.
    const cookieStore = await cookies();
    await removeUserFromSession({
      get: (name) => cookieStore.get(name),
      delete: () => {},
    });
    await createUserSession({ user }, cookieSetter(response));
  } else {
    const inviteToken = await ensureSsoInvite(db, integration, meeting, claims);
    target.searchParams.set("invite", inviteToken);
    target.searchParams.set("name", claims.name);
    response.headers.set("location", target.toString());
  }

  if (claims.returnUrl) {
    response.cookies.set(
      RETURN_COOKIE_NAME,
      await signReturnTarget(env.JWT_SECRET_KEY, {
        url: claims.returnUrl,
        name: integration.name,
        meetingCode: meeting.code,
      }),
      returnCookieOptions(env.NODE_ENV === "production"),
    );
  }

  return response;
}

/**
 * Marks a host token spent in one statement, so two tabs opening the same
 * link at once cannot both get a session. `meetingId` is part of the match
 * because the row is the token's binding to *this* meeting.
 */
async function consumeHostToken(jti: string, meetingId: string) {
  const [row] = await db
    .update(SsoTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(SsoTokensTable.jti, jti),
        eq(SsoTokensTable.meetingId, meetingId),
        eq(SsoTokensTable.role, "host"),
        isNull(SsoTokensTable.usedAt),
      ),
    )
    .returning({ jti: SsoTokensTable.jti });
  return row != null;
}

function cookieSetter(response: NextResponse) {
  return {
    set: (
      name: string,
      value: string,
      options: Parameters<typeof response.cookies.set>[2],
    ) => {
      response.cookies.set(name, value, options);
    },
  };
}

function fail(reason: ErrorReason) {
  const target = new URL("/sso/error", baseUrl);
  target.searchParams.set("reason", reason);
  return NextResponse.redirect(target);
}
