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

    // Integration layer. JWT_SECRET_KEY signs the short-lived /sso/join
    // links and the return-URL cookie; ADMIN_EMAILS (comma-separated) is
    // who may open /settings/integrations — the app has no role column.
    // Both optional here so a bare checkout builds; required once deployed.
    JWT_SECRET_KEY: z.string().min(32).optional(),
    ADMIN_EMAILS: z.string().min(1).optional(),

    // Billing. Which provider adapter is live; unset means "no billing" —
    // the pricing page shows the plans and no checkout, and the webhook
    // routes answer 503. A production deploy must have the full set for
    // the chosen provider (fail-closed check below).
    BILLING_PROVIDER: z.enum(["paymob"]).optional(),

    // Paymob (Egypt). Four credentials from the dashboard: the legacy API
    // key (bearer auth for plan/subscription endpoints), the secret key
    // (intention / unified checkout), the public key (checkout URL) and
    // the HMAC secret (callback verification). Test and live keys are
    // distinct; test integration ids only work with the test secret key.
    // The mode is never defaulted: once BILLING_PROVIDER is "paymob" an
    // unset value fails at boot rather than quietly running test keys in
    // production (or the reverse). Nothing else reads it — Paymob's API
    // host is the same in both modes; the keys decide.
    PAYMOB_API_KEY: z.string().min(1).optional(),
    PAYMOB_SECRET_KEY: z.string().min(1).optional(),
    PAYMOB_PUBLIC_KEY: z.string().min(1).optional(),
    PAYMOB_HMAC_SECRET: z.string().min(1).optional(),
    PAYMOB_MODE: z.enum(["test", "live"]).optional(),
    // Production normally refuses PAYMOB_MODE=test. Until the merchant
    // account is verified the live site runs against Paymob's test
    // environment on purpose — this is the explicit, loud opt-in for that,
    // so switching to live keys and forgetting the mode still fails the
    // build. Remove it together with the switch to live.
    PAYMOB_ALLOW_TEST_IN_PRODUCTION: z.enum(["true"]).optional(),
    // The online-card integration the checkout and the recurring
    // deductions run on (wallets cannot be tokenised, so cards only).
    PAYMOB_CARD_INTEGRATION_ID: z.coerce.number().int().positive().optional(),
    // One Paymob subscription plan per paid plan and billing interval
    // (`scripts/seed-paymob-plans.ts` creates them). Test and live differ.
    PAYMOB_PLAN_ID_PRO_MONTH: z.string().min(1).optional(),
    PAYMOB_PLAN_ID_PRO_YEAR: z.string().min(1).optional(),
    PAYMOB_PLAN_ID_BUSINESS_MONTH: z.string().min(1).optional(),
    PAYMOB_PLAN_ID_BUSINESS_YEAR: z.string().min(1).optional(),
    // Paymob's subscription webhook carries no signature, so its route is
    // only reachable at a path that includes this unguessable token — and
    // even then the event is only a hint; the subscription is re-read from
    // Paymob's API before anything is applied.
    PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN: z.string().min(16).optional(),
    // Set by Vercel when "Protection Bypass for Automation" is enabled on
    // the project. Appended to the callback URLs handed to Paymob so its
    // posts get through Vercel Authentication on the preview deployment.
    VERCEL_AUTOMATION_BYPASS_SECRET: z.string().min(1).optional(),

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

// Without a signing key every /sso/join link is unverifiable, and without an
// admin nobody can create an integration — either way the feature is dead
// on arrival, so a deploy without them is a broken deploy.
if (isDeployed && (!env.JWT_SECRET_KEY || !env.ADMIN_EMAILS)) {
  throw new Error(
    "JWT_SECRET_KEY and ADMIN_EMAILS are required in production.",
  );
}

// Local/dev-only fallbacks — never reached on a deployment, see the checks above.
export const baseUrl = env.BASE_URL ?? "http://localhost:3000";
export const oauthRedirectUrlBase =
  env.OAUTH_REDIRECT_URL_BASE ?? "http://localhost:3000/api/oauth";

/**
 * Lower-cased, trimmed admin addresses. Empty when unset — locally that
 * means no one is an admin until `.env` says otherwise, which is the
 * safe default.
 */
export const adminEmails: ReadonlySet<string> = new Set(
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const hasAllPaymobPlanIds = Boolean(
  env.PAYMOB_PLAN_ID_PRO_MONTH &&
    env.PAYMOB_PLAN_ID_PRO_YEAR &&
    env.PAYMOB_PLAN_ID_BUSINESS_MONTH &&
    env.PAYMOB_PLAN_ID_BUSINESS_YEAR,
);

const isPaymobConfigured = Boolean(
  env.PAYMOB_API_KEY &&
    env.PAYMOB_SECRET_KEY &&
    env.PAYMOB_PUBLIC_KEY &&
    env.PAYMOB_HMAC_SECRET &&
    env.PAYMOB_CARD_INTEGRATION_ID &&
    env.PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN &&
    hasAllPaymobPlanIds,
);

// The mode is only meaningful once the provider is on, and then it must be
// stated — never inferred from which keys happen to be present.
if (env.BILLING_PROVIDER === "paymob" && !env.PAYMOB_MODE) {
  throw new Error(
    "PAYMOB_MODE must be 'test' or 'live' when BILLING_PROVIDER=paymob — it is never defaulted.",
  );
}

// Billing must be whole in production: a half-configured provider means
// paying customers whose callbacks are dropped, which is worse than no
// billing.
if (env.VERCEL_ENV === "production" && env.BILLING_PROVIDER === "paymob") {
  if (!isPaymobConfigured) {
    throw new Error(
      "PAYMOB_API_KEY, PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET, PAYMOB_CARD_INTEGRATION_ID, PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN and all four PAYMOB_PLAN_ID_{PRO,BUSINESS}_{MONTH,YEAR} are required in production.",
    );
  }
  if (
    env.PAYMOB_MODE !== "live" &&
    env.PAYMOB_ALLOW_TEST_IN_PRODUCTION !== "true"
  ) {
    throw new Error(
      "PAYMOB_MODE must be 'live' in production (set PAYMOB_ALLOW_TEST_IN_PRODUCTION=true to run the live site against Paymob's test environment on purpose).",
    );
  }
}

/** Production is deliberately pointed at Paymob's test environment. */
export const isBillingInTestMode =
  env.BILLING_PROVIDER === "paymob" && env.PAYMOB_MODE === "test";

/** True when checkout can actually be offered. */
export const isBillingConfigured =
  env.BILLING_PROVIDER === "paymob" && isPaymobConfigured;
