import { createEnv } from "@t3-oss/env-nextjs";

/**
 * Browser-visible configuration. Empty on purpose: billing runs on a
 * hosted checkout page (a top-level redirect minted server-side), so the
 * browser holds no provider token. Add `NEXT_PUBLIC_*` keys here — and
 * name them in `experimental__runtimeEnv` — when something client-side
 * genuinely needs one.
 */
export const env = createEnv({
  client: {},
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
});
