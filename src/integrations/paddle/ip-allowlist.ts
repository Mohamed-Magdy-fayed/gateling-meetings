import "server-only";

import { env } from "@/data/env/server";

import { createPaddleIpAllowlist, PADDLE_IPS_URL } from "./ips";

/**
 * One allowlist per process, pointed at the same Paddle environment the
 * API key talks to (sandbox publishes its own list).
 *
 * Enforced only in production builds: `next dev` receives simulator
 * events through a tunnel or plain curl, neither of which arrives from a
 * Paddle address, and the signature check still stands on its own there.
 */
export const enforcePaddleIpAllowlist = env.NODE_ENV === "production";

export const paddleIpAllowlist = createPaddleIpAllowlist({
  url:
    env.PADDLE_ENVIRONMENT === "production"
      ? PADDLE_IPS_URL.production
      : PADDLE_IPS_URL.sandbox,
});
