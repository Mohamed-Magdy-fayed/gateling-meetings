import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Browser-visible configuration. Billing runs on a hosted checkout page (a
 * top-level redirect minted server-side), so the browser holds no provider
 * token. Add `NEXT_PUBLIC_*` keys here — and name them in
 * `experimental__runtimeEnv` — when something client-side genuinely needs
 * one. They are inlined at build time: changing one needs a redeploy.
 */
export const env = createEnv({
  client: {
    /** Kill switch for screen-share annotations; "0" turns them off. */
    NEXT_PUBLIC_MEETING_ANNOTATIONS: z.string().optional(),
    /** Kill switch for host controls in the floating window; "0" turns them off. */
    NEXT_PUBLIC_MEETING_PIP_HOST_CONTROLS: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_MEETING_ANNOTATIONS:
      process.env.NEXT_PUBLIC_MEETING_ANNOTATIONS,
    NEXT_PUBLIC_MEETING_PIP_HOST_CONTROLS:
      process.env.NEXT_PUBLIC_MEETING_PIP_HOST_CONTROLS,
  },
  emptyStringAsUndefined: true,
});
