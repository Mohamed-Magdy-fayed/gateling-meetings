import crypto from "node:crypto";
import { env } from "@/data/env/server";
import { sessionSchema } from "@/features/core/auth/schemas";

import type { Cookies, PartialUser } from "@/features/core/auth/types";
import { redisClient } from "@/integrations/redis";

const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7; // seven days
const COOKIE_SESSION_KEY = "session-id";

function getSessionExpirationSeconds() {
  return Math.floor(Date.now() / 1000) + SESSION_EXPIRATION_SECONDS;
}

function sessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

export async function getUserSession(cookies: Pick<Cookies, "get">) {
  const sessionId = cookies.get(COOKIE_SESSION_KEY)?.value;
  if (sessionId == null) return null;

  const session = await getUserSessionById(sessionId);
  if (session == null) return null;
  if (session.exp * 1000 <= Date.now()) return null;

  return session;
}

export async function createUserSession(
  options: {
    user: PartialUser;
    hasPassword?: boolean;
    orgId?: string | null;
  },
  cookies: Pick<Cookies, "set">,
) {
  const sessionId = crypto.randomBytes(512).toString("hex").normalize();
  const session = sessionSchema.parse({
    sessionId,
    exp: getSessionExpirationSeconds(),
    hasPassword: options.hasPassword ?? false,
    // Omitted rather than stored as null: HSET has no null, only strings.
    ...(options.orgId ? { orgId: options.orgId } : {}),
    user: options.user,
  });

  await redisClient
    .multi()
    .hset(sessionKey(sessionId), session)
    .expire(sessionKey(sessionId), SESSION_EXPIRATION_SECONDS)
    .exec();

  setCookie(sessionId, cookies);
}

/**
 * These functions each touch exactly one field of an existing session via
 * HSET, rather than reading the whole object and writing it back — two
 * concurrent calls from different tabs can no longer clobber each other's
 * unrelated field.
 */
export async function updateUserSessionData(
  user: PartialUser,
  cookies: Pick<Cookies, "get">,
) {
  const sessionId = cookies.get(COOKIE_SESSION_KEY)?.value;
  if (sessionId == null) return null;
  if (!(await redisClient.exists(sessionKey(sessionId)))) return null;

  await redisClient.hset(sessionKey(sessionId), {
    user: sessionSchema.shape.user.parse(user),
  });
}

/** Switches the active organization; the caller has verified membership. */
export async function setSessionOrganization(
  orgId: string,
  cookies: Pick<Cookies, "get">,
) {
  const sessionId = cookies.get(COOKIE_SESSION_KEY)?.value;
  if (sessionId == null) return null;
  if (!(await redisClient.exists(sessionKey(sessionId)))) return null;

  await redisClient.hset(sessionKey(sessionId), { orgId });
}

export async function updateUserSessionExpiration(
  cookies: Pick<Cookies, "get" | "set">,
) {
  const sessionId = cookies.get(COOKIE_SESSION_KEY)?.value;
  if (sessionId == null) return;

  const currentExp = await redisClient.hget<number>(
    sessionKey(sessionId),
    "exp",
  );
  if (currentExp == null) return;
  if (currentExp * 1000 <= Date.now()) return;

  await redisClient
    .multi()
    .hset(sessionKey(sessionId), { exp: getSessionExpirationSeconds() })
    .expire(sessionKey(sessionId), SESSION_EXPIRATION_SECONDS)
    .exec();
  setCookie(sessionId, cookies);
}

export async function removeUserFromSession(
  cookies: Pick<Cookies, "get" | "delete">,
) {
  const sessionId = cookies.get(COOKIE_SESSION_KEY)?.value;
  if (sessionId == null) return null;

  await redisClient.del(sessionKey(sessionId));
  cookies.delete(COOKIE_SESSION_KEY);
}

function setCookie(sessionId: string, cookies: Pick<Cookies, "set">) {
  cookies.set(COOKIE_SESSION_KEY, sessionId, {
    secure: env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(Date.now() + SESSION_EXPIRATION_SECONDS * 1000),
    path: "/",
  });
}

async function getUserSessionById(sessionId: string) {
  const rawSession = await redisClient.hgetall<Record<string, unknown>>(
    sessionKey(sessionId),
  );
  if (rawSession == null || Object.keys(rawSession).length === 0) return null;

  const { success, data: session } = sessionSchema.safeParse(rawSession);

  return success ? session : null;
}
