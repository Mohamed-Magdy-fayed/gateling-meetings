import "server-only";

import { Environment, Paddle } from "@paddle/paddle-node-sdk";

import { env } from "@/data/env/server";

let cached: Paddle | null = null;

/**
 * One SDK instance per process; it holds credentials, not a connection.
 * Throws (rather than returning a half-working client) when billing is not
 * configured, so a route that needs Paddle fails loudly instead of 500ing
 * three calls later.
 */
export function getPaddle(): Paddle {
  if (cached) return cached;
  if (!env.PADDLE_API_KEY) {
    throw new Error(
      "Paddle is not configured — set PADDLE_API_KEY (and the price ids).",
    );
  }
  cached = new Paddle(env.PADDLE_API_KEY, {
    environment:
      env.PADDLE_ENVIRONMENT === "production"
        ? Environment.production
        : Environment.sandbox,
  });
  return cached;
}
