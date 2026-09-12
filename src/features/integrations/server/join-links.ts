import { baseUrl, env } from "@/data/env/server";
import type { Database } from "@/drizzle";
import {
  type Integration,
  type Meeting,
  SsoTokensTable,
} from "@/drizzle/schema";
import { ApiError } from "@/integrations/api/errors";
import { isAllowedReturnUrl } from "@/integrations/sso/return-url";
import { mintSsoToken } from "@/integrations/sso/token";
import type { JoinLinkBody } from "./api-schemas";
import { ensureLinkedUser } from "./linked-users";

export function requireJwtSecret(): string {
  if (!env.JWT_SECRET_KEY) {
    throw new ApiError(
      500,
      "internal_error",
      "JWT_SECRET_KEY is not configured on this server.",
    );
  }
  return env.JWT_SECRET_KEY;
}

/**
 * Mints a signed `/sso/join` link. A host link is only issued to the
 * meeting's own host (the linked user); the token row is what makes it
 * single-use at redemption time.
 */
export async function createJoinLink(
  db: Database,
  integration: Integration,
  meeting: Meeting,
  body: JoinLinkBody,
) {
  if (meeting.status === "ended") {
    throw new ApiError(412, "precondition_failed", "This meeting has ended.");
  }
  if (
    body.returnUrl &&
    !isAllowedReturnUrl(body.returnUrl, integration.allowedReturnOrigins)
  ) {
    throw new ApiError(
      400,
      "validation_error",
      "returnUrl is not on an allowed origin for this integration.",
    );
  }

  if (body.role === "host") {
    const user = await ensureLinkedUser(db, integration, body.user);
    if (user.id !== meeting.hostId) {
      throw new ApiError(
        403,
        "forbidden",
        "Only the meeting's host can receive a host link.",
      );
    }
  }

  const { token, jti, expiresAt } = await mintSsoToken(requireJwtSecret(), {
    integrationSlug: integration.slug,
    meetingCode: meeting.code,
    role: body.role,
    externalId: body.user.externalId,
    name: body.user.name,
    email: body.user.email,
    returnUrl: body.returnUrl,
    expiresInSeconds: body.expiresIn,
  });

  await db.insert(SsoTokensTable).values({
    jti,
    integrationId: integration.id,
    meetingId: meeting.id,
    role: body.role,
    expiresAt,
  });

  return {
    url: `${baseUrl}/sso/join?token=${encodeURIComponent(token)}`,
    role: body.role,
    expiresAt: expiresAt.toISOString(),
    singleUse: body.role === "host",
  };
}
