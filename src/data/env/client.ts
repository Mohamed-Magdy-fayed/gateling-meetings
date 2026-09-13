import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    // Paddle.js client-side token (safe to expose) and which Paddle
    // environment it talks to; both empty until billing is set up.
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).optional(),
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: z
      .enum(["sandbox", "production"])
      .default("sandbox"),
  },
  // Next inlines NEXT_PUBLIC_* only when referenced by name.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN:
      process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
  },
  emptyStringAsUndefined: true,
});
