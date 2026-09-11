import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),

    // Sessions + rate limiting (Upstash). Optional so a bare checkout still
    // typechecks/builds; anything touching `redisClient` needs them at runtime.
    REDIS_URL: z.string().min(1).optional(),
    REDIS_TOKEN: z.string().min(1).optional(),

    // LiveKit — the SFU that carries every meeting. Works against LiveKit
    // Cloud (`wss://<project>.livekit.cloud`) or a self-hosted
    // `livekit-server` (`ws://localhost:7880` with `devkey`/`secret` in
    // `--dev` mode) with no code change. Optional here for the same reason
    // as Redis; the fail-closed check below makes them mandatory in production.
    LIVEKIT_URL: z.url().optional(),
    LIVEKIT_API_KEY: z.string().min(1).optional(),
    LIVEKIT_API_SECRET: z.string().min(1).optional(),

    // inngest-cli dev works keyless locally; prod needs both.
    INNGEST_SIGNING_KEY: z.string().min(1).optional(),
    INNGEST_EVENT_KEY: z.string().min(1).optional(),
    // Read by the Inngest SDK itself, declared here only so the deployment
    // guard below can see it. `.env` sets it to 1 for local dev.
    INNGEST_DEV: z.string().min(1).optional(),
    // Set by Vercel on every build and every runtime instance, and by nothing
    // else — the one reliable "this is a deployment, not a laptop" signal.
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),

    // Used to build absolute links (email verification, invite links, OAuth
    // redirect). Defaulted to localhost via `baseUrl`/`oauthRedirectUrlBase`
    // below, but required in production (see the fail-closed check).
    BASE_URL: z.url().optional(),
    OAUTH_REDIRECT_URL_BASE: z.url().optional(),

    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    // sendMail logs a warning and no-ops instead of throwing when unset.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM_EMAIL: z.email().optional(),
    SMTP_FROM_NAME: z.string().min(1).optional(),

    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  experimental__runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

// "This is a deployment, not a laptop." NODE_ENV can't stand in: `next build`
// and `npm run preview` set it to production on a developer machine too, and
// none of the checks below should demand production secrets there.
const isDeployed =
  env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production";

// Fail closed: INNGEST_DEV=1 disables Inngest's request signature
// verification. Fine for local dev, but must never reach a deployed
// environment un-keyed, or the /api/inngest endpoint is unprotected.
if (isDeployed && (!env.INNGEST_SIGNING_KEY || !env.INNGEST_EVENT_KEY)) {
  throw new Error(
    "INNGEST_SIGNING_KEY and INNGEST_EVENT_KEY are required in production.",
  );
}

// INNGEST_DEV points the SDK at a local dev server instead of Inngest Cloud.
// Copied into a Vercel scope it makes every `inngest.send` fail silently.
// "0" and "false" are the SDK's own explicit opt-outs and stay allowed.
const INNGEST_DEV_OPT_OUT = new Set(["0", "false"]);
if (
  isDeployed &&
  env.INNGEST_DEV &&
  !INNGEST_DEV_OPT_OUT.has(env.INNGEST_DEV.trim().toLowerCase())
) {
  throw new Error(
    "INNGEST_DEV must not be set on a Vercel deployment — it routes events to a local dev server.",
  );
}

// A blank BASE_URL in a deployed environment would silently fall back to
// localhost — emailing out an unusable invite link, or sending Google's OAuth
// redirect to a localhost URL, instead of failing the build.
if (isDeployed && (!env.BASE_URL || !env.OAUTH_REDIRECT_URL_BASE)) {
  throw new Error(
    "BASE_URL and OAUTH_REDIRECT_URL_BASE are required in production.",
  );
}

// There is no meeting without an SFU, so a deploy without LiveKit credentials
// is a broken deploy — better to fail the build than to 500 on every join.
if (
  isDeployed &&
  (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET)
) {
  throw new Error(
    "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production.",
  );
}

// Local/dev-only fallbacks — never reached on a deployment, see the checks above.
export const baseUrl = env.BASE_URL ?? "http://localhost:3000";
export const oauthRedirectUrlBase =
  env.OAUTH_REDIRECT_URL_BASE ?? "http://localhost:3000/api/oauth";
