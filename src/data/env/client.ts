import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    // Paddle.js client-side token (safe to expose) — empty until billing is
    // set up — and which Paddle environment it talks to. The environment is
    // never defaulted: an unset value fails the build rather than silently
    // pointing the browser at the wrong Paddle account.
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).optional(),
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"], {
      error:
        "NEXT_PUBLIC_PADDLE_ENVIRONMENT must be 'sandbox' or 'production' — it is never defaulted.",
    }),
  },
  // Next inlines NEXT_PUBLIC_* only when referenced by name.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN:
      process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
  },
  emptyStringAsUndefined: true,
});
