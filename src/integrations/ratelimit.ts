import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { headers } from "next/headers";

import { normalizeEmail } from "@/features/core/auth/core/helpers";
import { redisClient } from "@/integrations/redis";

/**
 * One limiter per auth endpoint so a burst on one flow (e.g. password-reset
 * OTP guessing) can't be worked around by hitting a different endpoint that
 * shares a budget.
 */
export const signInRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(10, "5 m"),
  prefix: "ratelimit:sign-in",
});

export const signUpRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(5, "60 m"),
  prefix: "ratelimit:sign-up",
});

export const passwordResetRequestRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(5, "60 m"),
  prefix: "ratelimit:password-reset-request",
});

// Tighter window than the request limiter above — a 6-digit OTP has only
// 1,000,000 combinations, so submission attempts need a stricter budget than
// requesting a fresh code does.
export const passwordResetSubmitRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(10, "15 m"),
  prefix: "ratelimit:password-reset-submit",
});

// Shared by begin + complete passkey authentication — they're one logical
// attempt from the caller's perspective, so they draw from the same budget.
export const passkeyAuthRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(10, "5 m"),
  prefix: "ratelimit:passkey-auth",
});

/**
 * Joining a meeting is unauthenticated (guests) and a wrong passcode returns
 * a fixed error, so without a budget the passcode is guessable. Keyed per
 * IP + meeting code: a room full of colleagues behind one office NAT still
 * gets 30 attempts per 10 minutes, which is far more than a real join needs.
 */
export const meetingJoinRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(30, "10 m"),
  prefix: "ratelimit:meeting-join",
});

/**
 * Second budget keyed on the meeting alone. `x-forwarded-for` is only as
 * trustworthy as the proxy in front of the app, so a passcode guesser who
 * rotates that header must still run out of attempts *per meeting*. Sized
 * for a big meeting's worth of genuine joins in ten minutes.
 */
export const meetingCodeRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(300, "10 m"),
  prefix: "ratelimit:meeting-code",
});

/**
 * The REST API (`/api/v1/*`), keyed per integration rather than per IP —
 * the callers are servers, often behind one egress address, and the API
 * key is the identity that matters. 120/min is far above any real system's
 * meeting-creation rate and low enough to blunt a leaked key.
 */
export const integrationApiRatelimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(120, "1 m"),
  prefix: "ratelimit:integration-api",
});

/**
 * Trusts `x-forwarded-for`/`x-real-ip` as set by the platform's own edge
 * network (this app deploys on Vercel) — Vercel's routing layer overwrites
 * these headers with the real client IP before a request reaches the
 * function, so a client can't spoof them in practice. Revisit if the app is
 * ever run directly behind an untrusted reverse proxy.
 */
export async function getRequestIp() {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return headerList.get("x-real-ip") || "unknown";
}

export function buildRatelimitKey(ip: string, email: string) {
  return `${ip}:${normalizeEmail(email)}`;
}

/** Returns true when the caller has exceeded the limiter's budget. */
export async function isRateLimited(limiter: Ratelimit, identifier: string) {
  const { success } = await limiter.limit(identifier);
  return !success;
}
