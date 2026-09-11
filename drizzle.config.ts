import type { Config } from "drizzle-kit";
import { env } from "@/data/env/server";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (check .env)");
}

export default {
  schema: "./src/drizzle/schema.ts",
  dialect: "postgresql",
  out: "./src/drizzle/migrations",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
} satisfies Config;
